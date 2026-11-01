let saveInProgress = false;

const videoCardSelector =
  "ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer";
const saveButtonSelector = "[data-ytcap-save-script]";

function getVideoUrl(card) {
  const videoLink = card.querySelector('a[href*="/watch?v="]');
  if (!videoLink) return null;

  try {
    const videoUrl = new URL(videoLink.href, location.origin);
    if (
      videoUrl.hostname === location.hostname &&
      videoUrl.pathname === "/watch" &&
      videoUrl.searchParams.has("v")
    ) {
      return videoUrl.href;
    }
  } catch (error) {
    console.error("Could not read the YouTube video URL.", error);
  }

  return null;
}

function addSaveButton(card) {
  const videoUrl = getVideoUrl(card);
  if (!videoUrl) return;

  let button = card.querySelector(saveButtonSelector);
  if (button) {
    if (button.dataset.videoUrl !== videoUrl) {
      button.dataset.videoUrl = videoUrl;
    }
    return;
  }

  const menuContainer = card.querySelector(
    "ytd-menu-renderer, .yt-lockup-metadata-view-model__menu-button, .yt-lockup-metadata-view-model-wiz__menu-button, .ytLockupMetadataViewModelMenuButton, #menu"
  );
  if (!menuContainer) return;

  button = document.createElement("button");
  button.type = "button";
  button.dataset.ytcapSaveScript = "";
  button.dataset.videoUrl = videoUrl;
  button.setAttribute("aria-label", "Save script to Notion");
  button.title = "Save script to Notion";
  button.disabled = saveInProgress;
  button.style.cssText =
    "display:flex;align-items:center;justify-content:center;flex-shrink:0;width:40px;height:40px;margin-right:4px;padding:8px;border:0;border-radius:50%;background:transparent;color:var(--yt-spec-text-primary,#0f0f0f);cursor:pointer";

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "24");
  icon.setAttribute("height", "24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("fill", "currentColor");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8zm-1 1.5L18.5 9H13zM7 12h10v1.5H7zm0 3h7v1.5H7zm0 3h10v1.5H7z"
  );
  icon.append(path);
  button.append(icon);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (saveInProgress) return;

    saveInProgress = true;
    document.querySelectorAll(saveButtonSelector).forEach((saveButton) => {
      saveButton.disabled = true;
    });

    chrome.runtime.sendMessage(
      {
        type: "SAVE_YOUTUBE_VIDEO_TO_NOTION",
        videoUrl: button.dataset.videoUrl
      },
      (response) => {
        if (chrome.runtime.lastError) {
          showSaveResult(false, chrome.runtime.lastError.message);
        } else if (response && !response.accepted) {
          showSaveResult(false, response.error);
        }

        saveInProgress = false;
        document.querySelectorAll(saveButtonSelector).forEach((saveButton) => {
          saveButton.disabled = false;
        });
      }
    );
  });

  menuContainer.insertAdjacentElement("beforebegin", button);
}

function updateVideoCards(records) {
  const cards = new Set();
  for (const record of records) {
    const target =
      record.target instanceof Element ? record.target : record.target.parentElement;
    const parentCard = target?.closest(videoCardSelector);
    if (parentCard) cards.add(parentCard);

    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches(videoCardSelector)) cards.add(node);
      node.querySelectorAll(videoCardSelector).forEach((card) => cards.add(card));
    }
  }

  cards.forEach(addSaveButton);
}

document.querySelectorAll(videoCardSelector).forEach(addSaveButton);

const videoCardObserver = new MutationObserver(updateVideoCards);
videoCardObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["href"]
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "YOUTUBE_NOTION_SAVE_RESULT") {
    showSaveResult(message.success, message.message);
  }
});

function showSaveResult(success, message) {
  let host = document.getElementById("ytcap-notion-toast");
  if (!host) {
    host = document.createElement("div");
    host.id = "ytcap-notion-toast";
    host.style.cssText = "position:fixed;z-index:2147483647;top:16px;right:16px";
    const shadow = host.attachShadow({ mode: "closed" });
    const toast = document.createElement("div");
    toast.style.cssText =
      "font:14px Arial,sans-serif;color:#fff;background:#202124;padding:14px 18px;border-radius:8px;max-width:360px;box-shadow:0 2px 8px #0006";
    shadow.append(toast);
    host._toast = toast;
    document.documentElement.append(host);
  }

  host._toast.textContent = message;
  host._toast.style.background = success ? "#188038" : "#b3261e";
  clearTimeout(host._timeout);
  host._timeout = setTimeout(() => host.remove(), 7000);
}
