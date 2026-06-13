const MENU_ID = "saythis-pronounce-selection";
const DEFAULT_RATE = 0.82;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "SayThis: pronounce \"%s\"",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) {
    return;
  }

  const selectedText = normalizeSelection(info.selectionText);
  if (!selectedText) {
    return;
  }

  chrome.storage.local.set({
    lastSelection: selectedText,
    lastSource: "context-menu"
  });

  speak(selectedText);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SAYTHIS_SPEAK") {
    const selectedText = normalizeSelection(message.text);
    if (!selectedText) {
      sendResponse({ ok: false, error: "No text selected." });
      return true;
    }

    speak(selectedText, message.lang);
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "SAYTHIS_STOP") {
    chrome.tts.stop();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

function normalizeSelection(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function speak(text, lang) {
  chrome.tts.stop();

  const options = {
    enqueue: false,
    rate: DEFAULT_RATE
  };

  if (lang && lang !== "auto") {
    options.lang = lang;
  }

  chrome.tts.speak(text, options);
}

