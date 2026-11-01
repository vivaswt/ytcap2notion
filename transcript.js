async function extractYouTubeTranscript() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const getSegments = () =>
    document.querySelectorAll(
      "ytd-transcript-segment-renderer, transcript-segment-view-model"
    );
  const isVisible = (element) => element && element.getClientRects().length > 0;
  const waitFor = async (find, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const result = find();
      if (result) return result;
      await sleep(500);
    }
    return find();
  };
  const getTranscriptButton = () => {
    const sectionButton = document.querySelector(
      "ytd-video-description-transcript-section-renderer button, ytd-video-description-transcript-section-renderer [role='button']"
    );
    if (isVisible(sectionButton)) return sectionButton;

    return Array.from(
      document.querySelectorAll("button, [role='button']")
    ).find((button) => {
      if (!isVisible(button)) return false;
      const label = [
        button.textContent,
        button.getAttribute("aria-label"),
        button.getAttribute("title")
      ]
        .filter(Boolean)
        .join(" ");
      return /transcript|文字起こし|文字起し/i.test(label);
    });
  };

  let segments = getSegments();

  if (segments.length === 0) {
    const expandButton = await waitFor(() => {
      const button = document.querySelector("ytd-text-inline-expander #expand");
      return isVisible(button) ? button : null;
    }, 5000);
    if (expandButton) {
      expandButton.click();
      await sleep(500);
    }

    const transcriptControl = await waitFor(() => {
      const button = getTranscriptButton();
      if (button) return { button };
      return getSegments().length > 0 ? { button: null } : null;
    });

    if (transcriptControl?.button) {
      transcriptControl.button.click();
    }

    if (transcriptControl) {
      segments = await waitFor(() => {
        const currentSegments = getSegments();
        return currentSegments.length > 0 ? currentSegments : null;
      }, 20000);
    } else {
      segments = getSegments();
    }
  }

  if (!segments || segments.length === 0) {
    return {
      error:
        "Could not find the transcript panel or its segments. This video might not have a transcript."
    };
  }

  const textSnippets = Array.from(segments)
    .map((segment) => {
      const textElement = segment.querySelector(
        ".segment-text, span.ytAttributedStringHost[role='text'], [class*='segment-text']"
      );
      return textElement ? textElement.textContent.trim() : "";
    })
    .filter(Boolean);

  const title = document.title
    .replace(/^\(\d+\)\s*/, "")
    .replace(/ - YouTube$/, "")
    .trim();

  return {
    title,
    transcript: textSnippets.join(" ").replace(/\s+/g, " ").trim()
  };
}
