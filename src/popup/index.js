import { getBestAudio, normalizeSelection } from "../resolver-core.js";
import {
  playbackItemsForResult,
  preferredSpeechResultForResult,
  speechResultForPlaybackItem
} from "../result/view.js";
import {
  isSharedAudioCandidate as sharedAudioCandidateForResult
} from "../result/shared-audio.js";
import {
  correctionFeedbackFromValues,
  hasCorrectionDetail
} from "../correction-form.js";
import {
  createFeedbackMessage,
  createDebugEventMessage,
  createPlayAudioMessage,
  createResolveMessage,
  createRequestSharedAudioMessage,
  createSpeakMessage,
  createStopMessage
} from "../message-contracts.js";
import {
  createPopupRuntimeAdapters,
  lookupHintsFromValue,
  openExtensionOptions,
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
  isReusableResultForSelection,
  shouldRefreshBeforeSpeech
} from "./speech-refresh.js";

const selectionInput = document.getElementById("selection");
const lookupHintsInput = document.getElementById("lookup-hints");
const openDebugButton = document.getElementById("open-debug");
const openOptionsButton = document.getElementById("open-options");
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
const runtimeAdapters = createPopupRuntimeAdapters();
const SHARED_AUDIO_UI_WAIT_MS = normalizeUiWaitMs(globalThis.__sayThisSharedAudioUiWaitMs, 900);

init();

resolveButton.addEventListener("click", () => resolveSelection());
onlineButton.addEventListener("click", () => resolveSelection(true));
openDebugButton.addEventListener("click", () => openDebugOptions());
openOptionsButton.addEventListener("click", () => openOptions());

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
  const trace = createPlaybackTrace(rate < 0.7 ? "popup-slow" : "popup-speak");
  const text = normalizeSelection(selectionInput.value);
  if (!text) {
    setStatus("No selected text.");
    updateButtonState();
    return;
  }

  recordTimingEvent("ui:speak-click", trace, {
    rate,
    text
  });

  if (!currentResult) {
    await resolveSelection();
  }

  const sharedAudioResult = await ensureSharedAudio(currentResult, rate, { trace });
  if (shouldPlayBeforeOnlineRefresh(currentResult, sharedAudioResult) && playAudio(sharedAudioResult, rate, trace)) {
    currentResult = sharedAudioResult;
    setStatus(rate < 0.7 ? "Starting audio slowly." : "Starting audio.");
    return;
  }
  currentResult = sharedAudioResult;

  if (shouldRefreshBeforeSpeech(currentResult)) {
    const refreshed = await resolveSelection(true);
    if (refreshed) {
      currentResult = refreshed;
    }
  }

  currentResult = await ensureSharedAudio(currentResult, rate, { trace });

  if (playAudio(currentResult, rate, trace)) {
    setStatus(rate < 0.7 ? "Starting audio slowly." : "Starting audio.");
    return;
  }

  const response = await sendMessage(createSpeakMessage(text, {
    result: currentResult,
    rate,
    skipSharedAudio: true,
    trace
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
  const activeSelection = await readActiveTabSelection(runtimeAdapters);
  const settings = await readPopupSettings(runtimeAdapters);
  const stored = await readStoredPopupState(runtimeAdapters);

  if (activeSelection) {
    selectionInput.value = activeSelection;
    await writeActiveTabPopupState(activeSelection, runtimeAdapters);

    if (settings.autoSpeakPopup && isReusableResultForSelection(stored.lastResult, activeSelection)) {
      currentResult = stored.lastResult;
      renderResult(currentResult);
      await speakSelection(0.82);
      updateButtonState();
      return;
    }

    const result = await resolveSelection();
    if (settings.autoSpeakPopup && result) {
      await speakSelection(0.82);
    }
  } else {
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

async function openOptions() {
  const response = await openExtensionOptions(runtimeAdapters);
  setStatus(response.ok ? "Options opened." : response.error || "Options unavailable.");
}

async function openDebugOptions() {
  const response = await openExtensionOptions(runtimeAdapters, { pageHash: "debug" });
  setStatus(response.ok ? "Debug opened." : response.error || "Options unavailable.");
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
  const trace = createPlaybackTrace("popup-alternate");
  const alternate = Array.isArray(currentResult?.alternateResults)
    ? currentResult.alternateResults[index]
    : null;
  if (!alternate) {
    return;
  }

  recordTimingEvent("ui:alternate-click", trace, { rate });

  if (playAudioItem(getBestAudio(alternate), alternate, rate, {
    replaceCurrent: false,
    trace
  })) {
    setStatus("Starting alternate.");
    return;
  }

  speakResultCandidate(preferredSpeechResultForResult(alternate), rate, "Speaking alternate", {
    replaceCurrent: false,
    trace
  });
}

async function speakResultCandidate(result, rate, statusBase = "Speaking", options = {}) {
  const trace = options.trace || createPlaybackTrace(statusBase.toLowerCase().replace(/\s+/g, "-") || "popup-row-speak");
  const text = normalizeSelection(selectionInput.value || result?.query || result?.sourceForm || result?.display);
  if (!text) {
    setStatus("No selected text.");
    return;
  }

  recordTimingEvent("ui:result-speak-click", trace, { rate, text });

  const sharedAudioResult = await ensureSharedAudio(result, rate, {
    ...options,
    trace
  });
  if (playAudio(sharedAudioResult, rate, trace)) {
    setStatus(rate < 0.7 ? "Starting audio slowly." : "Starting audio.");
    return;
  }

  const response = await sendMessage(createSpeakMessage(text, {
    result: sharedAudioResult,
    rate,
    skipSharedAudio: true,
    trace
  }));

  setStatus(response.ok
    ? speakingStatus(response, rate, statusBase)
    : response.error || "Speech failed.");
}

async function ensureSharedAudio(result, rate, options = {}) {
  if (!isSharedAudioCandidate(result)) {
    return result;
  }

  const text = normalizeSelection(selectionInput.value || result?.query || result?.display || result?.sourceForm);
  if (!text) {
    return result;
  }

  setStatus("Requesting shared voice.");
  const response = await responseWithinSharedAudioWait(sendMessage(createRequestSharedAudioMessage(text, {
    result,
    rate,
    trace: options.trace
  })));
  if (!response.ok || !getBestAudio(response.result)) {
    if (response.timedOut) {
      recordTimingEvent("shared-audio:ui-timeout", options.trace, { rate });
      setStatus("Using speech fallback.");
    }
    return result;
  }

  if (options.replaceCurrent !== false) {
    currentResult = response.result;
    renderResult(currentResult);
  }
  return response.result;
}

function playAudio(result, rate, trace) {
  const audio = getBestAudio(result);
  return playAudioItem(audio, result, rate, { skipSharedAudio: true, trace });
}

function shouldPlayBeforeOnlineRefresh(originalResult, candidateResult) {
  const audio = getBestAudio(candidateResult);
  if (!audio?.url) {
    return false;
  }

  return candidateResult !== originalResult || isGeneratedAudioItem(audio);
}

function playAudioItem(audio, result, rate, options = {}) {
  if (!audio?.url) {
    return false;
  }

  const trace = options.trace || createPlaybackTrace("popup-audio-row");
  recordTimingEvent("ui:audio-request", trace, {
    rate,
    quality: audio.quality,
    source: audio.source,
    urlHost: hostLabel(audio.url)
  });

  if (!options.skipSharedAudio && isGeneratedAudioItem(audio) && isSharedAudioCandidate(result)) {
    ensureSharedAudio(result, rate, options).then((sharedResult) => {
      const sharedAudio = getBestAudio(sharedResult);
      playAudioItem(sharedAudio || audio, sharedResult || result, rate, {
        ...options,
        skipSharedAudio: true,
        trace
      });
    });
    return true;
  }

  const fallbackToSpeech = async () => {
    setStatus("Audio failed. Using speech fallback.");
    const text = normalizeSelection(selectionInput.value);
    const response = await sendMessage(createSpeakMessage(text, {
      result,
      rate,
      skipSharedAudio: true,
      trace
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
    sendMessage(createPlayAudioMessage(audio, { rate, trace })).then((response) => {
      if (!response?.ok) {
        recordTimingEvent("audio:offscreen-error", trace, {
          error: response?.error || "Audio playback failed."
        });
        fallbackToSpeech();
        return;
      }

      recordTimingEvent("audio:offscreen-response", trace, response.playback || {});
      setStatus(startedStatus(rate, elapsedMs(trace)));
    });
    return true;
  }

  return audioPlayback.playUrl(audio.url, rate, fallbackToSpeech, {
    onStart: (details) => {
      recordTimingEvent("audio:popup-start", trace, details);
      setStatus(startedStatus(rate, elapsedMs(trace)));
    },
    onError: (details) => {
      recordTimingEvent("audio:popup-error", trace, details);
    }
  });
}

function isGeneratedAudioItem(audio = {}) {
  return String(audio.quality || "").trim().toLowerCase() === "generated";
}

function isSharedAudioCandidate(result = {}) {
  return sharedAudioCandidateForResult(result, selectionInput.value);
}

function stopAudio() {
  audioPlayback.stop();
}

function sendMessage(message) {
  return sendRuntimeMessage(message, runtimeAdapters);
}

function recordTimingEvent(kind, trace, payload = {}) {
  if (!trace?.id) {
    return;
  }

  sendMessage(createDebugEventMessage(kind, {
    ...payload,
    trace,
    elapsedMs: elapsedMs(trace)
  })).catch(() => {});
}

function createPlaybackTrace(action) {
  const startedAt = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return {
    id: `popup-${startedAt.toString(36)}-${random}`,
    source: "popup",
    action,
    startedAt
  };
}

function elapsedMs(trace) {
  return trace?.startedAt ? Math.max(0, Date.now() - Number(trace.startedAt)) : undefined;
}

function responseWithinSharedAudioWait(promise) {
  if (!SHARED_AUDIO_UI_WAIT_MS || typeof setTimeout !== "function") {
    return promise;
  }

  let timeoutId;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve({ ok: false, timedOut: true }), SHARED_AUDIO_UI_WAIT_MS);
    })
  ]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function normalizeUiWaitMs(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function setStatus(value) {
  statusText.textContent = value;
}

function startedStatus(rate, ms) {
  const value = Number.isFinite(Number(ms)) ? ` in ${Math.round(Number(ms))} ms` : "";
  return rate < 0.7 ? `Audio started slowly${value}.` : `Audio started${value}.`;
}

function hostLabel(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
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
