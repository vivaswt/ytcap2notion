async function sendToNotion(apiKey, databaseId, title, url, transcript) {
  if (!transcript.trim()) {
    throw new Error("The video transcript is empty.");
  }

  const childrenBlocks = [];
  let currentChunk = "";

  for (const word of transcript.split(/\s+/)) {
    if ((currentChunk ? currentChunk.length + 1 : 0) + word.length > 1800) {
      if (currentChunk) {
        childrenBlocks.push(createParagraphBlock(currentChunk));
      }
      currentChunk = word;
    } else {
      currentChunk = currentChunk ? `${currentChunk} ${word}` : word;
    }

    if (childrenBlocks.length >= 99) break;
  }

  if (currentChunk && childrenBlocks.length < 100) {
    childrenBlocks.push(createParagraphBlock(currentChunk));
  }

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        Source: { title: [{ text: { content: title || "YouTube Video" } }] },
        URL: { url }
      },
      children: childrenBlocks
    })
  });

  if (!response.ok) {
    let message = `Notion API Error: HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      message = errorData.message || message;
    } catch (error) {
      console.error("Could not read the Notion error response.", error);
    }
    throw new Error(message);
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
