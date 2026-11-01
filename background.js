importScripts("notion.js", "transcript.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "SAVE_YOUTUBE_VIDEO_TO_NOTION") return false;

  const tabId = sender.tab?.id;
  if (tabId === undefined) {
    sendResponse({ accepted: false, error: "Could not identify the YouTube tab." });
    return false;
  }

  saveVideoToNotion(tabId, message)
    .then((result) => sendResponse(result))
    .catch((error) => {
      console.error("Could not save the YouTube video to Notion.", error);
      sendResponse({ accepted: true, success: false, message: error.message });
    });

  return true;
});

async function saveVideoToNotion(tabId, message) {
  const originalUrl = message.originalUrl;
  const originalScrollY = message.scrollY;
  const videoUrl = new URL(message.videoUrl);
  const videoId = videoUrl.searchParams.get("v");

  if (
    videoUrl.hostname !== "www.youtube.com" ||
    videoUrl.pathname !== "/watch" ||
    !videoId
  ) {
    return { accepted: true, success: false, message: "That is not a valid YouTube video." };
  }

  const { notionApiKey, notionDbId } = await chrome.storage.sync.get([
    "notionApiKey",
    "notionDbId"
  ]);
  if (!notionApiKey || !notionDbId) {
    await notifyTab(tabId, false, "Open the extension and enter your Notion API key and database ID.");
    return {
      accepted: true,
      success: false,
      message: "Open the extension and enter your Notion API key and database ID."
    };
  }

  let result = { success: false, message: "Could not save this video to Notion." };
  let shouldRestore = false;

  try {
    shouldRestore = true;
    await navigateAndWait(tabId, videoUrl.href, (url) => {
      try {
        const current = new URL(url);
        return current.pathname === "/watch" && current.searchParams.get("v") === videoId;
      } catch {
        return false;
      }
    });

    const [extraction] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractYouTubeTranscript
    });
    const data = extraction?.result;
    if (!data) throw new Error("Could not read the transcript from this video.");
    if (data.error) throw new Error(data.error);

    await sendToNotion(notionApiKey, notionDbId, data.title, videoUrl.href, data.transcript);
    result = { success: true, message: "Saved to Notion." };
  } catch (error) {
    result = { success: false, message: error.message || "Could not save this video to Notion." };
  } finally {
    if (shouldRestore) {
      try {
        await navigateAndWait(tabId, originalUrl, (url) => url === originalUrl);
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (scrollY) => {
            window.scrollTo(0, scrollY);
            setTimeout(() => window.scrollTo(0, scrollY), 500);
          },
          args: [originalScrollY]
        });
      } catch (error) {
        result = {
          success: false,
          message: `The video could not be saved or the original page could not be restored: ${error.message}`
        };
        console.error("Could not restore the original YouTube page.", error);
      }
    }
  }

  await notifyTab(tabId, result.success, result.message);
  return { accepted: true, ...result };
}

function navigateAndWait(tabId, targetUrl, matchesTarget) {
  const loaded = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("Timed out while opening the YouTube page."));
    }, 30000);

    const finish = (error) => {
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (error) reject(error);
      else resolve();
    };

    const check = (tab) => {
      if (tab.status === "complete" && matchesTarget(tab.url || "")) finish();
    };

    const onUpdated = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") check(tab);
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then(check).catch(finish);
  });

  return chrome.tabs.update(tabId, { url: targetUrl }).then(() => loaded);
}

async function notifyTab(tabId, success, message) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "YOUTUBE_NOTION_SAVE_RESULT",
      success,
      message
    });
  } catch (error) {
    console.error("Could not show the save result on the YouTube page.", error);
  }
}
