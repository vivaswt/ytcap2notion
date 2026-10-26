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
    showStatus("Automating clicks... (this may take a few seconds)", "");

    try {
      // Get the currently active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !tab.url.includes("youtube.com/watch")) {
        throw new Error("Please open a specific YouTube video page.");
      }

      // Execute DOM automation & extraction inside the active YouTube page
      const [injectionResult] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: automateAndExtractTranscript
      });

      const result = injectionResult?.result;
      if (!result) {
        throw new Error("Failed to read data from the page.");
      }

      if (result.error) {
         throw new Error(result.error);
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
 * Clicks the necessary buttons, waits for loading, and extracts the text.
 */
async function automateAndExtractTranscript() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const getSegments = () => document.querySelectorAll("ytd-transcript-segment-renderer, transcript-segment-view-model");
  
  let segments = getSegments();

  // 1. If transcript is not already open, automate the clicks
  if (segments.length === 0) {
    // Step A: Find the "...more" button and click it
    // Note: We check offsetParent to ensure the button is actually visible
    const expandBtn = document.querySelector("ytd-text-inline-expander #expand");
    if (expandBtn && expandBtn.offsetParent !== null) {
      expandBtn.click();
      await sleep(500); // Wait half a second for the description box to expand
    }

    // Step B: Find the "Show transcript" button and click it
    // First, try finding it via YouTube's component tag (works regardless of language)
    let transcriptBtn = document.querySelector("ytd-video-description-transcript-section-renderer button");
    
    // Fallback: search all buttons for the text (in case YouTube's component structure changed)
    if (!transcriptBtn) {
      const allButtons = Array.from(document.querySelectorAll("button"));
      transcriptBtn = allButtons.find((b) => b.textContent.toLowerCase().includes("show transcript"));
    }

    if (transcriptBtn) {
      transcriptBtn.click();
      
      // Step C: Poll the DOM up to 10 times (5 seconds max) for segments to load
      for (let i = 0; i < 10; i++) {
        await sleep(500);
        segments = getSegments();
        if (segments.length > 0) break;
      }
    }
  }

  // 2. If it's STILL empty after automating clicks and waiting, return an error
  if (segments.length === 0) {
    return { 
       error: "Could not open the transcript panel automatically. It might not exist for this video." 
    };
  }

  // 3. Extract text from the segments (ignoring timestamps)
  const textSnippets = [];
  segments.forEach((segment) => {
    const textEl = segment.querySelector(".segment-text, span.ytAttributedStringHost[role='text'], [class*='segment-text']");
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
    transcript: textSnippets.join(" ").replace(/\s+/g, " ").trim()
  };
}

/**
 * Sends page data and chunked transcript text to the Notion API.
 */
async function sendToNotion(apiKey, databaseId, title, url, transcript) {
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
        "Source": { title: [{ text: { content: title || "YouTube Video" } }] },
        "URL": { url: url }
      },
      children: childrenBlocks
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Notion API Error: HTTP ${response.status}`);
  }
}

function createParagraphBlock(text) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: text } }]
    }
  };
}