const selectionInput = document.getElementById("selection");
const languageSelect = document.getElementById("language");
const speakButton = document.getElementById("speak");
const stopButton = document.getElementById("stop");
const statusText = document.getElementById("status");

init();

speakButton.addEventListener("click", async () => {
  const text = normalizeSelection(selectionInput.value);
  if (!text) {
    setStatus("No selected text.");
    updateButtonState();
    return;
  }

  await chrome.storage.local.set({
    lastSelection: text,
    lastSource: "popup"
  });

  chrome.runtime.sendMessage({
    type: "SAYTHIS_SPEAK",
    text,
    lang: languageSelect.value
  });

  setStatus("Speaking.");
});

stopButton.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SAYTHIS_STOP" });
  setStatus("Stopped.");
});

selectionInput.addEventListener("input", updateButtonState);

async function init() {
  const activeSelection = await readActiveTabSelection();

  if (activeSelection) {
    selectionInput.value = activeSelection;
    await chrome.storage.local.set({
      lastSelection: activeSelection,
      lastSource: "active-tab"
    });
    setStatus("Ready.");
  } else {
    const stored = await chrome.storage.local.get(["lastSelection"]);
    selectionInput.value = stored.lastSelection || "";
    setStatus(selectionInput.value ? "Using last selection." : "Select text, then speak it.");
  }

  updateButtonState();
}

async function readActiveTabSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      return "";
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() || ""
    });

    return normalizeSelection(result?.result);
  } catch {
    return "";
  }
}

function normalizeSelection(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function setStatus(value) {
  statusText.textContent = value;
}

function updateButtonState() {
  speakButton.disabled = !normalizeSelection(selectionInput.value);
}

