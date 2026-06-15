import { getBestAudio, normalizeSelection } from "./resolver-core.js";
import {
  alternateItemsForResult,
  evidenceItemsForResult,
  sourceItemsForResult
} from "./result-view.js";
import {
  correctionFeedbackFromValues,
  correctionValuesFromResult,
  hasCorrectionDetail
} from "./correction-form.js";
import {
  createFeedbackMessage,
  createResolveMessage,
  createSpeakMessage,
  createStopMessage
} from "./message-contracts.js";

const selectionInput = document.getElementById("selection");
const resolveButton = document.getElementById("resolve");
const onlineButton = document.getElementById("resolve-online");
const speakButton = document.getElementById("speak");
const slowButton = document.getElementById("slow");
const stopButton = document.getElementById("stop");
const statusText = document.getElementById("status");
const resultCard = document.getElementById("result-card");
const resultDisplay = document.getElementById("result-display");
const confidenceBadge = document.getElementById("confidence-badge");
const sourceBadge = document.getElementById("source-badge");
const sourceForm = document.getElementById("source-form");
const language = document.getElementById("language");
const category = document.getElementById("category");
const origin = document.getElementById("origin");
const ipa = document.getElementById("ipa");
const simpleGuide = document.getElementById("simple-guide");
const alternates = document.getElementById("alternates");
const evidence = document.getElementById("evidence");
const sources = document.getElementById("sources");
const confirmButton = document.getElementById("confirm");
const wrongButton = document.getElementById("wrong");
const missingButton = document.getElementById("missing");
const saveCorrectionButton = document.getElementById("save-correction");
const correctionSource = document.getElementById("correction-source");
const correctionLanguage = document.getElementById("correction-language");
const correctionLanguageName = document.getElementById("correction-language-name");
const correctionSimple = document.getElementById("correction-simple");
const correctionIpa = document.getElementById("correction-ipa");
const correctionOrigin = document.getElementById("correction-origin");
const correctionAudio = document.getElementById("correction-audio");
const correctionSourceUrl = document.getElementById("correction-source-url");
const correctionVariant = document.getElementById("correction-variant");

let currentResult = null;
let audioPlayer = null;

init();

resolveButton.addEventListener("click", () => resolveSelection());
onlineButton.addEventListener("click", () => resolveSelection(true));

speakButton.addEventListener("click", () => speakSelection(0.82));
slowButton.addEventListener("click", () => speakSelection(0.62));

stopButton.addEventListener("click", async () => {
  stopAudio();
  await sendMessage(createStopMessage());
  setStatus("Stopped.");
});

confirmButton.addEventListener("click", () => saveFeedback({ kind: "confirm" }));
wrongButton.addEventListener("click", () => saveFeedback({ kind: "wrong" }));
missingButton.addEventListener("click", () => saveFeedback({ kind: "missing" }));

saveCorrectionButton.addEventListener("click", () => {
  const feedback = correctionFeedbackFromValues({
    sourceForm: correctionSource.value,
    language: correctionLanguage.value,
    languageName: correctionLanguageName.value,
    simple: correctionSimple.value,
    ipa: correctionIpa.value,
    origin: correctionOrigin.value,
    audioUrl: correctionAudio.value,
    sourceUrl: correctionSourceUrl.value,
    variantNote: correctionVariant.value
  });

  if (!hasCorrectionDetail(feedback)) {
    setStatus("Add correction details.");
    return;
  }

  saveFeedback(feedback);
});

selectionInput.addEventListener("input", () => {
  currentResult = null;
  updateButtonState();
  resultCard.hidden = true;
});

async function speakSelection(rate) {
  const text = normalizeSelection(selectionInput.value);
  if (!text) {
    setStatus("No selected text.");
    updateButtonState();
    return;
  }

  if (!currentResult) {
    await resolveSelection();
  }

  if (playAudio(currentResult, rate)) {
    setStatus(rate < 0.7 ? "Playing audio slowly." : "Playing audio.");
    return;
  }

  const response = await sendMessage(createSpeakMessage(text, {
    result: currentResult,
    rate
  }));

  if (response.ok) {
    currentResult = response.result;
    renderResult(currentResult);
    setStatus(rate < 0.7 ? "Speaking slowly." : "Speaking.");
  } else {
    setStatus(response.error || "Speech failed.");
  }
}

async function init() {
  const activeSelection = await readActiveTabSelection();

  if (activeSelection) {
    selectionInput.value = activeSelection;
    await chrome.storage.local.set({
      lastSelection: activeSelection,
      lastSource: "active-tab"
    });
    await resolveSelection();
  } else {
    const stored = await chrome.storage.local.get(["lastSelection", "lastResult"]);
    selectionInput.value = stored.lastSelection || "";
    if (stored.lastResult) {
      currentResult = stored.lastResult;
      renderResult(currentResult);
    }
    setStatus(selectionInput.value ? "Using last selection." : "Select text, then resolve it.");
  }

  updateButtonState();
}

async function resolveSelection(useOnline) {
  const text = normalizeSelection(selectionInput.value);
  if (!text) {
    setStatus("No selected text.");
    updateButtonState();
    return;
  }

  setStatus(useOnline ? "Checking online sources." : "Resolving.");
  const response = await sendMessage(createResolveMessage(text, {
    useOnline
  }));

  if (!response.ok) {
    setStatus(response.error || "Resolve failed.");
    return;
  }

  currentResult = response.result;
  renderResult(currentResult);
  setStatus("Ready.");
  return currentResult;
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

async function saveFeedback(feedback) {
  const text = normalizeSelection(selectionInput.value);
  if (!text) {
    setStatus("No selected text.");
    return;
  }

  const response = await sendMessage(createFeedbackMessage(text, feedback));

  if (response.ok) {
    currentResult = response.result;
    renderResult(currentResult);
    setStatus("Saved.");
  } else {
    setStatus(response.error || "Could not save.");
  }
}

function renderResult(result) {
  if (!result) {
    resultCard.hidden = true;
    return;
  }

  resultCard.hidden = false;
  resultDisplay.textContent = result.display || result.query || "Unknown";
  confidenceBadge.textContent = result.confidence || "unknown";
  sourceBadge.textContent = result.sourceLabel || result.sourceStatus || "Unknown";
  sourceForm.textContent = result.sourceForm || "No source form";
  language.textContent = result.languageName || result.language || "Unknown";
  category.textContent = result.category || "Unknown";
  origin.textContent = result.origin || "Unknown";
  ipa.textContent = result.pronunciation?.ipa || "Not available";
  simpleGuide.textContent = result.pronunciation?.simple || "Not available";

  const correctionValues = correctionValuesFromResult(result);
  correctionSource.value = correctionValues.sourceForm;
  correctionLanguage.value = correctionValues.language;
  correctionLanguageName.value = correctionValues.languageName;
  correctionSimple.value = correctionValues.simple;
  correctionIpa.value = correctionValues.ipa;
  correctionOrigin.value = correctionValues.origin;
  correctionAudio.value = correctionValues.audioUrl;
  correctionSourceUrl.value = correctionValues.sourceUrl;
  correctionVariant.value = correctionValues.variantNote;

  alternates.replaceChildren();
  for (const item of alternateItemsForResult(result)) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.className = "alternate-label";
    label.textContent = item.display || "Alternate";
    const summary = document.createElement("span");
    summary.textContent = item.summary;
    li.append(label, summary);
    alternates.append(li);
  }

  evidence.replaceChildren();
  for (const item of evidenceItemsForResult(result)) {
    const li = document.createElement("li");
    li.textContent = item;
    evidence.append(li);
  }

  sources.replaceChildren();
  for (const item of sourceItemsForResult(result)) {
    const li = document.createElement("li");
    const anchor = document.createElement("a");
    anchor.href = item.url;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = item.label;
    li.append(anchor);
    sources.append(li);
  }
}

function playAudio(result, rate) {
  const audio = getBestAudio(result);
  if (!audio?.url) {
    return false;
  }

  stopAudio();
  audioPlayer = new Audio(audio.url);
  audioPlayer.playbackRate = rate < 0.7 ? 0.75 : 1;
  audioPlayer.addEventListener("error", () => {
    setStatus("Audio failed. Use Speak for TTS fallback.");
  }, { once: true });
  audioPlayer.play().catch(() => {
    setStatus("Audio could not start. Use Speak for TTS fallback.");
  });
  return true;
}

function stopAudio() {
  if (!audioPlayer) {
    return;
  }

  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  audioPlayer = null;
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      resolve(response || { ok: false, error: "No response." });
    });
  });
}

function setStatus(value) {
  statusText.textContent = value;
}

function updateButtonState() {
  const hasText = Boolean(normalizeSelection(selectionInput.value));
  resolveButton.disabled = !hasText;
  onlineButton.disabled = !hasText;
  speakButton.disabled = !hasText;
  slowButton.disabled = !hasText;
}
