# YouTube Transcript to Notion (Chrome Extension)

A lightweight Google Chrome Extension (Manifest V3) that extracts the transcript directly from the open YouTube video transcript panel and sends it as continuous, timestamp-free text to your Notion database.

---

## Features

- **No Timestamps**: Extracts text cleanly and joins segments with spaces for natural readability.
- **Word-Safe Paragraph Chunking**: Automatically breaks long transcripts into readable Notion paragraph blocks without slicing words in half (respects Notion's 2,000-character block limit).
- **Direct Notion Integration**: Calls the Notion API directly from your browser—no third-party proxy or backend server required.
- **Credential Storage**: Saves your Notion API Key and Database ID locally in Chrome storage so you only need to enter them once.

---

## Project Structure

```text
youtube-transcript-notion/
├── manifest.json
├── popup.html
├── popup.js
└── README.md