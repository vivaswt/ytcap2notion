document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("apiKey");
  const dbIdInput = document.getElementById("dbId");
  const saveBtn = document.getElementById("saveBtn");
  const statusEl = document.getElementById("status");

  // 1. Load previously saved credentials from storage
  chrome.storage.sync.get(["notionApiKey", "notionDbId"], (data) => {
    if (data.notionApiKey) apiKeyInput.value = data.notionApiKey;
    if (data.notionDbId) dbIdInput.value = data.notionDbId;
  });

  // 2. Handle button click
  saveBtn.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim();
    const dbId = dbIdInput.value.trim();

    if (!apiKey || !dbId) {
      showStatus("Please enter both Notion API Key and Database ID.", "error");
      return;
    }

    // Save credentials for subsequent runs
    chrome.storage.sync.set({ notionApiKey: apiKey, notionDbId: dbId });

    saveBtn.disabled = true;
    showStatus("Checking YouTube page...", "");

    try {
      // Get the currently active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !tab.url.includes("youtube.com/watch")) {
        throw new Error("Please open a specific YouTube video page.");
      }

      showStatus("Extracting transcript from DOM...", "");

      // Execute DOM extraction inside the active YouTube page
      const [injectionResult] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractTranscriptFromDOM
      });

      const result = injectionResult?.result;
      if (!result) {
        throw new Error("Failed to read data from the page.");
      }

      if (!result.transcript) {
        throw new Error(
          "Transcript panel not found! Please open the 'Transcript' section on YouTube first."
        );
      }

      showStatus("Sending to Notion...", "");

      // Post the extracted transcript to Notion
      await sendToNotion(apiKey, dbId, result.title, tab.url, result.transcript);

      showStatus("Successfully saved to Notion!", "success");
    } catch (err) {
      showStatus(err.message, "error");
    } finally {
      saveBtn.disabled = false;
    }
  });

  function showStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = type;
  }
});

/**
 * Executes directly within YouTube's DOM context.
 * Collects only the text content (ignoring all timestamps).
 */
function extractTranscriptFromDOM() {
  const segmentElements = document.querySelectorAll(
    "ytd-transcript-segment-renderer, transcript-segment-view-model"
  );

  if (!segmentElements || segmentElements.length === 0) {
    return { title: document.title, transcript: null };
  }

  const textSnippets = [];

  segmentElements.forEach((segment) => {
    // Extract only text content, omitting the timestamp elements completely
    const textEl = segment.querySelector(
      ".segment-text, span.ytAttributedStringHost[role='text'], [class*='segment-text']"
    );
    const text = textEl ? textEl.textContent.trim() : "";

    if (text) {
      textSnippets.push(text);
    }
  });

  // Clean the tab title
  const cleanTitle = document.title
    .replace(/^\(\d+\)\s*/, "") // Remove notification prefix like "(1) "
    .replace(/ - YouTube$/, "")
    .trim();

  return {
    title: cleanTitle,
    // Join with spaces to create natural, fluent text
    transcript: textSnippets.join(" ").replace(/\s+/g, " ").trim()
  };
}

/**
 * Sends page data and chunked transcript text to the Notion API.
 */
async function sendToNotion(apiKey, databaseId, title, url, transcript) {
  // Notion limits text blocks to 2,000 characters.
  // We split by words into ~1,800-character chunks so sentences aren't cut mid-word.
  const CHUNK_LIMIT = 1800;
  const childrenBlocks = [];
  const words = transcript.split(" ");
  let currentChunk = "";

  for (const word of words) {
    if ((currentChunk + " " + word).length > CHUNK_LIMIT) {
      if (currentChunk.trim().length > 0) {
        childrenBlocks.push(createParagraphBlock(currentChunk.trim()));
      }
      currentChunk = word;
    } else {
      currentChunk = currentChunk ? `${currentChunk} ${word}` : word;
    }

    // Notion allows a max of 100 block children in a single API call
    if (childrenBlocks.length >= 99) break;
  }

  if (currentChunk.trim().length > 0 && childrenBlocks.length < 100) {
    childrenBlocks.push(createParagraphBlock(currentChunk.trim()));
  }

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        "Source": {
          title: [
            {
              text: { content: title || "YouTube Video" }
            }
          ]
        },
        "URL": {
          url: url
        }
      },
      children: childrenBlocks
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Notion API Error: HTTP ${response.status}`
    );
  }
}

/**
 * Helper to build a Notion paragraph block object.
 */
function createParagraphBlock(text) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [
        {
          type: "text",
          text: { content: text }
        }
      ]
    }
  };
}