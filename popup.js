document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("apiKey");
  const dbIdInput = document.getElementById("dbId");
  const saveBtn = document.getElementById("saveBtn");
  const statusEl = document.getElementById("status");

  chrome.storage.sync.get(["notionApiKey", "notionDbId"], (data) => {
    if (data.notionApiKey) apiKeyInput.value = data.notionApiKey;
    if (data.notionDbId) dbIdInput.value = data.notionDbId;
  });

  saveBtn.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim();
    const dbId = dbIdInput.value.trim();

    if (!apiKey || !dbId) {
      showStatus("Please enter both Notion API Key and Database ID.", "error");
      return;
    }

    saveBtn.disabled = true;
    showStatus("Extracting transcript...", "");

    try {
      await chrome.storage.sync.set({ notionApiKey: apiKey, notionDbId: dbId });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !tab.url.includes("youtube.com/watch") || tab.id === undefined) {
        throw new Error("Please open a specific YouTube video page.");
      }

      const [injectionResult] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractYouTubeTranscript
      });
      const result = injectionResult?.result;
      if (!result) throw new Error("Failed to read data from the page.");
      if (result.error) throw new Error(result.error);

      showStatus("Sending to Notion...", "");
      await sendToNotion(apiKey, dbId, result.title, tab.url, result.transcript);
      showStatus("Successfully saved to Notion!", "success");
    } catch (error) {
      showStatus(error.message || "Could not save this video to Notion.", "error");
    } finally {
      saveBtn.disabled = false;
    }
  });

  function showStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = type;
  }
});
