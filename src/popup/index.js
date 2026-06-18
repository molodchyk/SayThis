import { getBestAudio, hasPreferredAudio, normalizeSelection } from "../resolver-core.js";
import {
  playbackItemsForResult,
  preferredSpeechResultForResult,
  speechResultForPlaybackItem
} from "../result/view.js";
import {
  correctionFeedbackFromValues,
  hasCorrectionDetail
} from "../correction-form.js";
import {
  createFeedbackMessage,
  createPlayAudioMessage,
  createResolveMessage,
  createRequestSharedAudioMessage,
  createSpeakMessage,
  createStopMessage
} from "../message-contracts.js";
import {
  lookupHintsFromValue,
  readActiveTabSelection,
  readPopupSettings,
  readStoredPopupState,
  sendRuntimeMessage,
  writeActiveTabPopupState
} from "./runtime-adapters.js";
import {
  createPopupAudioPlayback
} from "./audio-playback.js";
import {
  renderPopupResult
} from "./result-renderer.js";
import {
  shouldRefreshBeforeSpeech
} from "./speech-refresh.js";

const selectionInput = document.getElementById("selection");
const lookupHintsInput = document.getElementById("lookup-hints");
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
const domainHint = document.getElementById("domain-hint");
const variants = document.getElementById("variants");
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
const correctionDomain = document.getElementById("correction-domain");
const correctionVariants = document.getElementById("correction-variants");
const correctionAudio = document.getElementById("correction-audio");
const correctionSourceUrl = document.getElementById("correction-source-url");
const correctionVariant = document.getElementById("correction-variant");

let currentResult = null;
const audioPlayback = createPopupAudioPlayback();

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

  if (shouldRefreshBeforeSpeech(currentResult)) {
    const refreshed = await resolveSelection(true);
    if (refreshed) {
      currentResult = refreshed;
    }
  }

  currentResult = await ensureSharedAudio(currentResult, rate);

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
    setStatus(speakingStatus(response, rate));
  } else {
    setStatus(response.error || "Speech failed.");
  }
}

async function init() {
  const activeSelection = await readActiveTabSelection(popupRuntimeAdapters());

  if (activeSelection) {
    selectionInput.value = activeSelection;
    await writeActiveTabPopupState(activeSelection, popupRuntimeAdapters());
    const result = await resolveSelection();
    const settings = await readPopupSettings(popupRuntimeAdapters());
    if (settings.autoSpeakPopup && result) {
      await speakSelection(0.82);
    }
  } else {
    const stored = await readStoredPopupState(popupRuntimeAdapters());
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
  const languageHints = lookupHints();
  if (!text) {
    setStatus("No selected text.");
    updateButtonState();
    return;
  }

  setStatus(useOnline || languageHints.length ? "Checking online sources." : "Resolving.");
  const response = await sendMessage(createResolveMessage(text, {
    useOnline: useOnline || languageHints.length ? true : useOnline,
    languageHints
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
  renderPopupResult(result, {
    resultCard,
    resultDisplay,
    confidenceBadge,
    sourceBadge,
    sourceForm,
    aliasesDisplay,
    language,
    category,
    origin,
    root,
    domainHint,
    variants,
    ipa,
    simpleGuide,
    alternates,
    audioList,
    evidence,
    sources,
    correctionSource,
    correctionAliases,
    correctionLanguage,
    correctionLanguageName,
    correctionSimple,
    correctionIpa,
    correctionOrigin,
    correctionRoot,
    correctionDomain,
    correctionVariants,
    correctionAudio,
    correctionSourceUrl,
    correctionVariant
  }, {
    document,
    speakAlternate,
    speakResult: (result, rate) => speakResultCandidate(result, rate, "Speaking"),
    playAudioItem,
    setStatus
  });
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
      domainHint: correctionDomain.value,
      variants: correctionVariants.value,
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

  speakResultCandidate(preferredSpeechResultForResult(alternate), rate, "Speaking alternate");
}

async function speakResultCandidate(result, rate, statusBase = "Speaking") {
  const text = normalizeSelection(selectionInput.value || result?.query || result?.sourceForm || result?.display);
  if (!text) {
    setStatus("No selected text.");
    return;
  }

  const sharedAudioResult = await ensureSharedAudio(result, rate);
  if (playAudio(sharedAudioResult, rate)) {
    setStatus(rate < 0.7 ? "Playing audio slowly." : "Playing audio.");
    return;
  }

  const response = await sendMessage(createSpeakMessage(text, {
    result: sharedAudioResult,
    rate
  }));

  setStatus(response.ok
    ? speakingStatus(response, rate, statusBase)
    : response.error || "Speech failed.");
}

async function ensureSharedAudio(result, rate) {
  if (!isSharedAudioCandidate(result)) {
    return result;
  }

  const text = normalizeSelection(selectionInput.value || result?.query || result?.display || result?.sourceForm);
  if (!text) {
    return result;
  }

  setStatus("Requesting shared voice.");
  const response = await sendMessage(createRequestSharedAudioMessage(text, {
    result,
    rate
  }));
  if (!response.ok || !getBestAudio(response.result)) {
    return result;
  }

  currentResult = response.result;
  renderResult(currentResult);
  return response.result;
}

function playAudio(result, rate) {
  const audio = getBestAudio(result);
  return playAudioItem(audio, result, rate, { skipSharedAudio: true });
}

function playAudioItem(audio, result, rate, options = {}) {
  if (!audio?.url) {
    return false;
  }

  if (!options.skipSharedAudio && isGeneratedAudioItem(audio) && isSharedAudioCandidate(result)) {
    ensureSharedAudio(result, rate).then((sharedResult) => {
      const sharedAudio = getBestAudio(sharedResult);
      playAudioItem(sharedAudio || audio, sharedResult || result, rate, {
        ...options,
        skipSharedAudio: true
      });
    });
    return true;
  }

  const fallbackToSpeech = async () => {
    setStatus("Audio failed. Using speech fallback.");
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
      setStatus(speakingStatus(response, rate));
    } else {
      setStatus(response.error || "Speech failed.");
    }
  };

  if (isGeneratedAudioItem(audio)) {
    sendMessage(createPlayAudioMessage(audio, { rate })).then((response) => {
      if (!response?.ok) {
        fallbackToSpeech();
      }
    });
    return true;
  }

  return audioPlayback.playUrl(audio.url, rate, fallbackToSpeech);
}

function isGeneratedAudioItem(audio = {}) {
  return String(audio.quality || "").trim().toLowerCase() === "generated";
}

function isSharedAudioCandidate(result = {}) {
  return Boolean(
    result &&
    !hasPreferredAudio(result) &&
    normalizeSelection(result.sourceForm || result.display || result.query) &&
    normalizeSelection(result.ttsLang) &&
    baseLanguage(result.ttsLang) !== "en" &&
    !["", "unknown", "best-effort-fallback"].includes(normalizeSelection(result.sourceStatus))
  );
}

function baseLanguage(value) {
  return normalizeSelection(value).toLowerCase().split(/[-_]/)[0];
}

function stopAudio() {
  audioPlayback.stop();
}

function sendMessage(message) {
  return sendRuntimeMessage(message, popupRuntimeAdapters());
}

function setStatus(value) {
  statusText.textContent = value;
}

function lookupHints() {
  return lookupHintsFromValue(lookupHintsInput.value);
}

function updateButtonState() {
  const hasText = Boolean(normalizeSelection(selectionInput.value));
  resolveButton.disabled = !hasText;
  onlineButton.disabled = !hasText;
  speakButton.disabled = !hasText;
  slowButton.disabled = !hasText;
}

function speakingStatus(response, rate, base = "Speaking") {
  if (response?.speech?.fallback === "audio") {
    return rate < 0.7 ? "Playing audio slowly." : "Playing audio.";
  }

  const guide = response?.speech?.fallback === "guide";
  if (guide) {
    return rate < 0.7 ? "Speaking guide slowly." : "Speaking guide.";
  }

  return rate < 0.7 ? `${base} slowly.` : `${base}.`;
}

function popupRuntimeAdapters() {
  return {
    getStorage: (keys) => chrome.storage.local.get(keys),
    setStorage: (value) => chrome.storage.local.set(value),
    queryTabs: (query) => chrome.tabs.query(query),
    executeScript: (details) => chrome.scripting.executeScript(details),
    sendMessage: (message, callback) => chrome.runtime.sendMessage(message, callback),
    lastError: () => chrome.runtime.lastError
  };
}
