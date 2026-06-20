import {
  createLookupKey,
  getBestAudio,
  hasPreferredAudio,
  normalizeSelection,
  resultToSpeechOptions
} from "../resolver-core.js";
import {
  createOffscreenDebugStateMessage,
  createOffscreenPrepareAudioMessage,
  createOffscreenPlayAudioMessage,
  createOffscreenSpeakMessage,
  createOffscreenStopAudioMessage,
  createShowResultMessage
} from "../message-contracts.js";
import {
  normalizeSpeakableGuide
} from "../resolver/pronunciation-guide.js";
import {
  normalizeSettings
} from "../shared/settings.js";
import {
  hasNonEnglishLanguageSignal
} from "../result/shared-audio.js";
import {
  preferredSpeechResultForResult,
  shouldPreferSpeechBeforeAudio
} from "../result/view.js";
import {
  baseVoiceLocale,
  normalizeVoiceLocale,
  preferredVoiceScoreForLabel,
  voiceLocaleMatchesRequest
} from "../shared/voice-preferences.js";
import {
  playAudioItemOffscreen as playAudioItemOffscreenFlow,
  playAudioOffscreen as playAudioOffscreenFlow,
  playResolvedResult as playResolvedResultFlow
} from "./result-playback-flow.js";

const DEFAULT_OFFSCREEN_AUDIO_URL = "src/offscreen-audio.html";
const DEFAULT_STORAGE_KEYS = {
  settings: "settings"
};
const NAME_CONNECTOR_WORDS = new Set(["a", "al", "and", "ap", "bin", "da", "de", "del", "der", "di", "du", "el", "ibn", "in", "la", "le", "of", "saint", "san", "santa", "st", "the", "van", "von"]);

export function createPlaybackSurface(dependencies = {}) {
  const offscreenAudioUrl = dependencies.offscreenAudioUrl || DEFAULT_OFFSCREEN_AUDIO_URL;
  const storageKeys = {
    ...DEFAULT_STORAGE_KEYS,
    ...(dependencies.storageKeys || {})
  };
  let offscreenCreatePromise = null;
  let ttsVoicesPromise = null;

  return {
    ensureOffscreenAudioDocument,
    getOffscreenDebugState,
    getSettings,
    hasOffscreenAudioDocument,
    prepareAudioItemOffscreen,
    playAudioItemOffscreen,
    playAudioOffscreen,
    playResolvedResult,
    showResultOnTab,
    speakResult,
    stopOffscreenAudio,
    stopPlayback
  };

  async function playResolvedResult(result, tabId, trace) {
    return playResolvedResultFlow(result, tabId, {
      getBestAudio,
      hasPreferredAudio,
      preferredSpeechResultForResult,
      showResultOnTab,
      playAudioOffscreen,
      speakResult,
      shouldPreferSpeechBeforeAudio
    }, trace);
  }

  async function playAudioOffscreen(result, rate = 0.82, trace) {
    return playAudioOffscreenFlow(result, {
      getBestAudio,
      hasOffscreenAudioSupport: () => Boolean(dependencies.hasOffscreenAudioSupport?.()),
      ensureOffscreenAudioDocument,
      sendOffscreenPlayAudioMessage: (audio, playbackRate, messageTrace) =>
        dependencies.sendRuntimeMessage?.(createOffscreenPlayAudioMessage(audio, playbackRate, {
          trace: messageTrace
        })),
      onOffscreenAudioDebug: (payload) => recordPlaybackDebug("offscreen-audio:result", payload)
    }, rate, trace);
  }

  async function playAudioItemOffscreen(audio, rate = 0.82, trace) {
    return playAudioItemOffscreenFlow(audio, {
      hasOffscreenAudioSupport: () => Boolean(dependencies.hasOffscreenAudioSupport?.()),
      ensureOffscreenAudioDocument,
      sendOffscreenPlayAudioMessage: (audioItem, playbackRate, messageTrace) =>
        dependencies.sendRuntimeMessage?.(createOffscreenPlayAudioMessage(audioItem, playbackRate, {
          trace: messageTrace
        })),
      onOffscreenAudioDebug: (payload) => recordPlaybackDebug("offscreen-audio:result", payload)
    }, rate, trace);
  }

  async function prepareAudioItemOffscreen(audio, trace) {
    if (!audio?.url || !dependencies.hasOffscreenAudioSupport?.()) {
      return false;
    }

    try {
      await ensureOffscreenAudioDocument();
      const response = await dependencies.sendRuntimeMessage?.(createOffscreenPrepareAudioMessage(audio, {
        trace
      }));
      if (response?.prepared) {
        recordPlaybackDebug("offscreen-audio:prepare", {
          ...response.prepared,
          trace
        });
      }
      return response?.prepared || Boolean(response?.ok);
    } catch {
      return false;
    }
  }

  async function speakResult(result, overrides = {}) {
    const speech = resultToSpeechOptions(result, overrides);
    if (!speech.text) {
      return {
        spoken: false,
        error: "Speech unavailable."
      };
    }

    if (!speech.options.lang && isAllowedUnresolvedProperNameSpeech(result, speech)) {
      speech.options.lang = "en-US";
    }

    if (shouldRejectUntrustedRawSpeech(result, speech)) {
      return {
        spoken: false,
        error: "Speech unavailable for unresolved text."
      };
    }

    if (shouldRejectMissingSpeechLanguage(result, speech)) {
      return {
        spoken: false,
        error: "Speech unavailable without a resolved language."
      };
    }

    if (shouldRejectPlainEnglishSameTextSpeech(result, speech)) {
      return {
        spoken: false,
        error: "Speech unavailable for plain English text without a guide."
      };
    }

    if (shouldRejectCrossLanguageEnglishSpeech(result, speech)) {
      return {
        spoken: false,
        error: "Speech unavailable for non-English text with an English voice."
      };
    }

    const voice = await bestTtsVoice(speech.options.lang);
    if (!voice.voiceName && shouldRequireVerifiedVoice(result, speech.options.lang)) {
      const offscreenSpeech = await speakTextOffscreen(speech.text, speech.options);
      if (offscreenSpeech?.spoken) {
        return offscreenSpeech;
      }

      const guideSpeech = await speakGuideFallback(result, speech.options.rate);
      if (guideSpeech) {
        return guideSpeech;
      }

      return {
        spoken: false,
        error: `No verified browser voice for ${speech.options.lang}.`
      };
    }

    if (voice.checked && !voice.voiceName) {
      return {
        spoken: false,
        error: `No matching browser voice for ${speech.options.lang}.`
      };
    }

    const options = voice.voiceName
      ? { ...speech.options, voiceName: voice.voiceName }
      : speech.options;

    dependencies.stopTts?.();
    const spoken = await dependencies.speakTts?.(speech.text, options);
    if (spoken?.ok === false) {
      return {
        spoken: false,
        error: spoken.error || "Speech failed."
      };
    }

    return {
      spoken: true,
      text: speech.text,
      options
    };
  }

  async function speakTextOffscreen(text, options = {}) {
    recordPlaybackDebug("offscreen-speech:start", {
      text: normalizeSelection(text),
      options: {
        lang: options.lang,
        rate: options.rate
      }
    });

    if (!dependencies.hasOffscreenAudioSupport?.()) {
      const result = {
        spoken: false,
        error: "Offscreen audio unavailable."
      };
      recordPlaybackDebug("offscreen-speech:skipped", result);
      return result;
    }

    try {
      await ensureOffscreenAudioDocument();
      const response = await dependencies.sendRuntimeMessage?.(createOffscreenSpeakMessage(text, options));
      if (!response?.ok) {
        const result = {
          spoken: false,
          error: response?.error || "Web speech failed."
        };
        recordPlaybackDebug("offscreen-speech:error", result);
        return result;
      }

      const result = {
        spoken: true,
        text: response.speech?.text || text,
        options: {
          enqueue: false,
          rate: options.rate,
          lang: options.lang,
          ...(response.speech?.voiceName ? { voiceName: response.speech.voiceName } : {})
        },
        fallback: "web-speech"
      };
      recordPlaybackDebug("offscreen-speech:result", result);
      return result;
    } catch (error) {
      const result = {
        spoken: false,
        error: error?.message || "Web speech failed."
      };
      recordPlaybackDebug("offscreen-speech:error", result);
      return result;
    }
  }

  async function speakGuideFallback(result, rate) {
    const guide = normalizeSpeakableGuide(result?.pronunciation?.simple);
    if (!guide || !result?.ttsLang || baseVoiceLang(result.ttsLang) === "en") {
      return null;
    }

    const guideVoice = await bestTtsVoice("en-US");
    if (guideVoice.checked && !guideVoice.voiceName) {
      return null;
    }

    const options = {
      enqueue: false,
      rate,
      lang: "en-US",
      ...(guideVoice.voiceName ? { voiceName: guideVoice.voiceName } : {})
    };

    dependencies.stopTts?.();
    const spoken = await dependencies.speakTts?.(guide, options);
    if (spoken?.ok === false) {
      return {
        spoken: false,
        error: spoken.error || "Speech failed."
      };
    }

    return {
      spoken: true,
      text: guide,
      options,
      fallback: "guide"
    };
  }

  function shouldRequireVerifiedVoice(result, lang) {
    return Boolean(
      lang &&
      baseVoiceLang(lang) !== "en" &&
      normalizeSelection(result?.sourceForm || result?.speakText || result?.display || result?.query)
    );
  }

  function shouldRejectUntrustedRawSpeech(result, speech = {}) {
    const sourceStatus = normalizeSelection(result?.sourceStatus);
    if (!["", "unknown", "best-effort-fallback"].includes(sourceStatus)) {
      return false;
    }

    if (isAllowedUnresolvedProperNameSpeech(result, speech)) {
      return false;
    }

    const text = normalizeSelection(speech.text);
    const guide = normalizeSpeakableGuide(result?.pronunciation?.simple);
    if (guide && text === guide) {
      return false;
    }

    const lang = normalizeSelection(speech.options?.lang);
    if (lang && baseVoiceLang(lang) !== "en") {
      return false;
    }

    return true;
  }

  function shouldRejectMissingSpeechLanguage(result, speech = {}) {
    if (isAllowedUnresolvedProperNameSpeech(result, speech)) {
      return false;
    }

    if (normalizeSelection(speech.options?.lang)) {
      return false;
    }

    const text = normalizeSelection(speech.text);
    const guide = normalizeSpeakableGuide(result?.pronunciation?.simple);
    return !(guide && text === guide);
  }

  function shouldRejectPlainEnglishSameTextSpeech(result, speech = {}) {
    if (isAllowedUnresolvedProperNameSpeech(result, speech)) {
      return false;
    }

    const lang = normalizeSelection(speech.options?.lang || result?.ttsLang || result?.language);
    if (baseVoiceLang(lang) !== "en") {
      return false;
    }

    const text = normalizeSelection(speech.text);
    const guide = normalizeSpeakableGuide(result?.pronunciation?.simple);
    if (guide && text === guide) {
      return false;
    }

    const selectedKey = createLookupKey(result?.query || result?.display);
    const sourceKey = createLookupKey(result?.sourceForm || result?.display || result?.query);
    return Boolean(selectedKey && sourceKey && selectedKey === sourceKey);
  }

  function isAllowedUnresolvedProperNameSpeech(result, speech = {}) {
    if (normalizeSelection(result?.sourceStatus) !== "best-effort-fallback") {
      return false;
    }

    const text = normalizeSelection(speech.text || result?.speakText || result?.sourceForm || result?.display || result?.query);
    if (!text || text.length > 90 || /[.!?;:]/.test(text)) {
      return false;
    }

    const selected = normalizeSelection(result?.query || result?.display || result?.sourceForm);
    if (createLookupKey(text) !== createLookupKey(selected)) {
      return false;
    }

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 8) {
      return false;
    }

    return words.every(isNameLikeWord);
  }

  function isNameLikeWord(word = "") {
    const normalized = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!normalized) {
      return false;
    }

    if (NAME_CONNECTOR_WORDS.has(normalized.toLocaleLowerCase())) {
      return true;
    }

    return /^[\p{Lu}\p{Lt}][\p{L}\p{M}'’.-]*$/u.test(normalized);
  }

  function shouldRejectCrossLanguageEnglishSpeech(result, speech = {}) {
    const language = normalizeSelection(result?.language);
    const lang = normalizeSelection(speech.options?.lang || result?.ttsLang);
    if (!hasNonEnglishLanguageSignal(language) || baseVoiceLang(lang) !== "en") {
      return false;
    }

    const text = normalizeSelection(speech.text);
    const guide = normalizeSpeakableGuide(result?.pronunciation?.simple);
    return !(guide && text === guide);
  }

  async function stopOffscreenAudio() {
    if (!dependencies.hasOffscreenAudioSupport?.()) {
      return;
    }

    try {
      await dependencies.sendRuntimeMessage?.(createOffscreenStopAudioMessage());
    } catch {
      // The offscreen document may not exist yet.
    }
  }

  async function stopPlayback() {
    dependencies.stopTts?.();
    await stopOffscreenAudio();
  }

  async function getOffscreenDebugState(lang = "") {
    if (!dependencies.hasOffscreenAudioSupport?.()) {
      return {
        supported: false,
        error: "Offscreen audio unavailable."
      };
    }

    try {
      await ensureOffscreenAudioDocument();
      const response = await dependencies.sendRuntimeMessage?.(createOffscreenDebugStateMessage({ lang }));
      if (!response?.ok) {
        return {
          supported: true,
          error: response?.error || "Offscreen diagnostics unavailable."
        };
      }

      return {
        supported: true,
        ...response.debug
      };
    } catch (error) {
      return {
        supported: true,
        error: error?.message || "Offscreen diagnostics unavailable."
      };
    }
  }

  async function ensureOffscreenAudioDocument() {
    if (offscreenCreatePromise) {
      await offscreenCreatePromise;
      return;
    }

    if (await hasOffscreenAudioDocument()) {
      return;
    }

    offscreenCreatePromise = dependencies.createOffscreenDocument?.({
      url: offscreenAudioUrl,
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play pronunciation audio and matching voice speech when a page overlay is unavailable."
    })?.finally(() => {
      offscreenCreatePromise = null;
    });

    await offscreenCreatePromise;
  }

  async function hasOffscreenAudioDocument() {
    if (typeof dependencies.hasOffscreenDocument === "function") {
      return dependencies.hasOffscreenDocument();
    }

    if (typeof dependencies.matchClients !== "function") {
      return false;
    }

    const offscreenUrl = runtimeUrl(offscreenAudioUrl);
    const matchedClients = await dependencies.matchClients();
    return matchedClients.some((client) => client.url === offscreenUrl);
  }

  async function showResultOnTab(tabId, result, options = {}) {
    if (!tabId || !result) {
      return false;
    }

    try {
      const settings = await getSettings();
      if (!settings.showOverlay) {
        return false;
      }

      await dependencies.executeScript?.({
        target: { tabId },
        files: [
          "src/content/overlay-style.js",
          "src/content/overlay-runtime-adapters.js",
          "src/content/overlay-language.js",
          "src/content/overlay-result-view.js",
          "src/content-overlay.js"
        ]
      });
      const visibleResult = preloadVisibleResultAudio(result, options.trace);
      await dependencies.sendTabMessage?.(tabId, createShowResultMessage(visibleResult, {
        autoPlay: Boolean(options.autoPlay)
      }));
      return true;
    } catch {
      // Some pages do not allow extension script injection.
      return false;
    }
  }

  function preloadVisibleResultAudio(result, trace) {
    try {
      return dependencies.preloadVisibleResultAudio?.(result, trace) || result;
    } catch {
      return result;
    }
  }

  async function getSettings() {
    const stored = await dependencies.getStorage?.([storageKeys.settings]);
    return normalizeSettings(stored?.[storageKeys.settings]);
  }

  function runtimeUrl(url) {
    return typeof dependencies.getRuntimeUrl === "function"
      ? dependencies.getRuntimeUrl(url)
      : url;
  }

  async function bestTtsVoice(lang) {
    if (!lang || typeof dependencies.getTtsVoices !== "function") {
      return { checked: false, voiceName: "" };
    }

    if (!ttsVoicesPromise) {
      ttsVoicesPromise = Promise.resolve(dependencies.getTtsVoices()).catch(() => []);
    }

    const voices = await ttsVoicesPromise;
    if (!Array.isArray(voices) || !voices.length) {
      return { checked: false, voiceName: "" };
    }

    return {
      checked: true,
      voiceName: selectTtsVoiceName(voices, lang)
    };
  }

  function recordPlaybackDebug(kind, payload = {}) {
    dependencies.onDebugEvent?.(kind, payload);
  }
}

export function selectTtsVoiceName(voices = [], lang = "") {
  const requested = normalizeVoiceLocale(lang);
  const requestedBase = baseVoiceLocale(requested);
  if (!requested || !requestedBase) {
    return "";
  }

  return voices
    .map((voice, index) => {
      const voiceLang = normalizeVoiceLocale(voice?.lang);
      const exactScore = voiceLang === requested ? 100 : 0;
      const baseScore = !exactScore && voiceLocaleMatchesRequest(voiceLang, requested) ? 50 : 0;
      const score = exactScore || baseScore;
      if (!score || !voice?.voiceName) {
        return null;
      }

      return {
        voiceName: voice.voiceName,
        score: score + preferredVoiceScoreForLabel(voice.voiceName, requested) + (voice.remote ? 10 : 0),
        index
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.voiceName || "";
}

function baseVoiceLang(value) {
  return baseVoiceLocale(value);
}
