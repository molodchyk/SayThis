import { getBestAudio, normalizeSelection } from "./resolver-core.js";
import {
  alternateItemsForResult,
  audioItemsForResult,
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
const aliasesDisplay = document.getElementById("aliases");
const language = document.getElementById("language");
const category = document.getElementById("category");
const origin = document.getElementById("origin");
const root = document.getElementById("root");
const ipa = document.getElementById("ipa");
const simpleGuide = document.getElementById("simple-guide");
const alternates = document.getElementById("alternates");
const audioList = document.getElementById("audio-list");
const evidence = document.getElementById("evidence");
const sources = document.getElementById("sources");
const confirmButton = document.getElementById("confirm");
const wrongButton = document.getElementById("wrong");
const missingButton = document.getElementById("missing");
const saveCorrectionButton = document.getElementById("save-correction");
const correctionSource = document.getElementById("correction-source");
const correctionAliases = document.getElementById("correction-aliases");
const correctionLanguage = document.getElementById("correction-language");
const correctionLanguageName = document.getElementById("correction-language-name");
const correctionSimple = document.getElementById("correction-simple");
const correctionIpa = document.getElementById("correction-ipa");
const correctionOrigin = document.getElementById("correction-origin");
const correctionRoot = document.getElementById("correction-root");
const correctionAudio = document.getElementById("correction-audio");
const correctionSourceUrl = document.getElementById("correction-source-url");
const correctionVariant = document.getElementById("correction-variant");

const DEFAULT_POPUP_SETTINGS = {
  autoSpeakPopup: true
};

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
missingButton.addEventListener("click", () => saveFeedback(feedbackFromCorrectionFields("missing")));

saveCorrectionButton.addEventListener("click", () => {
  const feedback = feedbackFromCorrectionFields("correction");

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
    const result = await resolveSelection();
    const settings = await readPopupSettings();
    if (settings.autoSpeakPopup && result) {
      await speakSelection(0.82);
    }
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

async function readPopupSettings() {
  const stored = await chrome.storage.local.get(["settings"]);
  return {
    ...DEFAULT_POPUP_SETTINGS,
    ...(stored.settings || {}),
    autoSpeakPopup: stored.settings?.autoSpeakPopup !== false
  };
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

  const correctionValues = correctionValuesFromResult(result);
  sourceForm.textContent = result.sourceForm || "No source form";
  aliasesDisplay.textContent = correctionValues.aliases || "None";
  language.textContent = result.languageName || result.language || "Unknown";
  category.textContent = result.category || "Unknown";
  origin.textContent = result.origin || "Unknown";
  root.textContent = result.root || "Unknown";
  ipa.textContent = result.pronunciation?.ipa || "Not available";
  simpleGuide.textContent = result.pronunciation?.simple || "Not available";

  correctionSource.value = correctionValues.sourceForm;
  correctionAliases.value = correctionValues.aliases;
  correctionLanguage.value = correctionValues.language;
  correctionLanguageName.value = correctionValues.languageName;
  correctionSimple.value = correctionValues.simple;
  correctionIpa.value = correctionValues.ipa;
  correctionOrigin.value = correctionValues.origin;
  correctionRoot.value = correctionValues.root;
  correctionAudio.value = correctionValues.audioUrl;
  correctionSourceUrl.value = correctionValues.sourceUrl;
  correctionVariant.value = correctionValues.variantNote;

  alternates.replaceChildren();
  for (const item of alternateItemsForResult(result)) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "small secondary";
    button.textContent = "Speak";
    button.addEventListener("click", () => speakAlternate(item.index, 0.82));
    const label = document.createElement("span");
    label.className = "alternate-label";
    label.textContent = item.display || "Alternate";
    const summary = document.createElement("span");
    summary.textContent = item.summary;
    li.append(button, label, summary);
    alternates.append(li);
  }

  audioList.replaceChildren();
  for (const item of audioItemsForResult(result)) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "small secondary";
    button.textContent = "Play";
    button.addEventListener("click", () => {
      if (playAudioItem(item, currentResult, 0.82)) {
        setStatus("Playing recording.");
      }
    });
    const label = document.createElement("span");
    label.textContent = item.label || "Pronunciation audio";
    li.append(button, label);
    audioList.append(li);
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

function feedbackFromCorrectionFields(kind) {
  return {
    ...correctionFeedbackFromValues({
      sourceForm: correctionSource.value,
      aliases: correctionAliases.value,
      language: correctionLanguage.value,
      languageName: correctionLanguageName.value,
      simple: correctionSimple.value,
      ipa: correctionIpa.value,
      origin: correctionOrigin.value,
      root: correctionRoot.value,
      audioUrl: correctionAudio.value,
      sourceUrl: correctionSourceUrl.value,
      variantNote: correctionVariant.value
    }),
    kind
  };
}

function speakAlternate(index, rate) {
  const alternate = Array.isArray(currentResult?.alternateResults)
    ? currentResult.alternateResults[index]
    : null;
  if (!alternate) {
    return;
  }

  if (playAudioItem(getBestAudio(alternate), alternate, rate, { replaceCurrent: false })) {
    setStatus("Playing alternate.");
    return;
  }

  speakResultCandidate(alternate, rate);
}

async function speakResultCandidate(result, rate) {
  const text = normalizeSelection(selectionInput.value || result?.query || result?.sourceForm || result?.display);
  if (!text) {
    setStatus("No selected text.");
    return;
  }

  const response = await sendMessage(createSpeakMessage(text, {
    result,
    rate
  }));

  setStatus(response.ok
    ? rate < 0.7 ? "Speaking alternate slowly." : "Speaking alternate."
    : response.error || "Speech failed.");
}

function playAudio(result, rate) {
  const audio = getBestAudio(result);
  return playAudioItem(audio, result, rate);
}

function playAudioItem(audio, result, rate, options = {}) {
  if (!audio?.url) {
    return false;
  }

  stopAudio();
  let fallbackStarted = false;
  const fallbackToSpeech = async () => {
    if (fallbackStarted) {
      return;
    }

    fallbackStarted = true;
    setStatus("Audio failed. Using TTS fallback.");
    const text = normalizeSelection(selectionInput.value);
    const response = await sendMessage(createSpeakMessage(text, {
      result,
      rate
    }));
    if (response.ok) {
      if (options.replaceCurrent !== false) {
        currentResult = response.result;
        renderResult(currentResult);
      }
      setStatus(rate < 0.7 ? "Speaking slowly." : "Speaking.");
    } else {
      setStatus(response.error || "Speech failed.");
    }
  };

  audioPlayer = new Audio(audio.url);
  audioPlayer.playbackRate = rate < 0.7 ? 0.75 : 1;
  audioPlayer.addEventListener("error", () => {
    fallbackToSpeech();
  }, { once: true });
  audioPlayer.play().catch(() => {
    fallbackToSpeech();
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
