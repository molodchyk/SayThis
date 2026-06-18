import {
  getBestAudio,
  normalizeSelection,
  resultToSpeechOptions
} from "../resolver-core.js";
import {
  createOffscreenPlayAudioMessage,
  createOffscreenStopAudioMessage,
  createShowResultMessage
} from "../message-contracts.js";
import {
  normalizeSettings
} from "../shared/settings.js";
import {
  playAudioOffscreen as playAudioOffscreenFlow,
  playResolvedResult as playResolvedResultFlow
} from "./result-playback-flow.js";

const DEFAULT_OFFSCREEN_AUDIO_URL = "src/offscreen-audio.html";
const DEFAULT_STORAGE_KEYS = {
  settings: "settings"
};

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
    getSettings,
    hasOffscreenAudioDocument,
    playAudioOffscreen,
    playResolvedResult,
    showResultOnTab,
    speakFallback,
    speakResult,
    stopOffscreenAudio,
    stopPlayback
  };

  async function playResolvedResult(result, tabId) {
    return playResolvedResultFlow(result, tabId, {
      getBestAudio,
      showResultOnTab,
      playAudioOffscreen,
      speakResult
    });
  }

  async function playAudioOffscreen(result, rate = 0.82) {
    return playAudioOffscreenFlow(result, {
      getBestAudio,
      hasOffscreenAudioSupport: () => Boolean(dependencies.hasOffscreenAudioSupport?.()),
      ensureOffscreenAudioDocument,
      sendOffscreenPlayAudioMessage: (audio, playbackRate) =>
        dependencies.sendRuntimeMessage?.(createOffscreenPlayAudioMessage(audio, playbackRate))
    }, rate);
  }

  async function speakResult(result, overrides = {}) {
    const speech = resultToSpeechOptions(result, overrides);
    if (!speech.text) {
      return;
    }

    const voice = await bestTtsVoice(speech.options.lang);
    if (!voice.voiceName && shouldRequireVerifiedVoice(result, speech.options.lang)) {
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
    dependencies.speakTts?.(speech.text, options);
    return {
      spoken: true,
      text: speech.text,
      options
    };
  }

  async function speakGuideFallback(result, rate) {
    const guide = normalizeSelection(result?.pronunciation?.simple);
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
    dependencies.speakTts?.(guide, options);
    return {
      spoken: true,
      text: guide,
      options,
      fallback: "guide"
    };
  }

  function speakFallback(text) {
    dependencies.stopTts?.();
    dependencies.speakTts?.(text, {
      enqueue: false,
      rate: 0.82
    });
  }

  function shouldRequireVerifiedVoice(result, lang) {
    return Boolean(
      lang &&
      baseVoiceLang(lang) !== "en" &&
      normalizeSelection(result?.sourceForm || result?.speakText || result?.display || result?.query)
    );
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

  async function ensureOffscreenAudioDocument() {
    if (await hasOffscreenAudioDocument()) {
      return;
    }

    if (!offscreenCreatePromise) {
      offscreenCreatePromise = dependencies.createOffscreenDocument?.({
        url: offscreenAudioUrl,
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play pronunciation audio when a page overlay is unavailable."
      })?.finally(() => {
        offscreenCreatePromise = null;
      });
    }

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
        files: ["src/content/overlay-style.js", "src/content/overlay-runtime-adapters.js", "src/content/overlay-result-view.js", "src/content-overlay.js"]
      });
      await dependencies.sendTabMessage?.(tabId, createShowResultMessage(result, {
        autoPlay: Boolean(options.autoPlay)
      }));
      return true;
    } catch {
      // Some pages do not allow extension script injection.
      return false;
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
}

export function selectTtsVoiceName(voices = [], lang = "") {
  const requested = normalizeVoiceLang(lang);
  const requestedBase = baseVoiceLang(requested);
  if (!requested || !requestedBase) {
    return "";
  }

  return voices
    .map((voice, index) => {
      const voiceLang = normalizeVoiceLang(voice?.lang);
      const voiceBase = baseVoiceLang(voiceLang);
      const exactScore = voiceLang === requested ? 4 : 0;
      const baseScore = !exactScore && voiceBase === requestedBase ? 2 : 0;
      const score = exactScore || baseScore;
      if (!score || !voice?.voiceName) {
        return null;
      }

      return {
        voiceName: voice.voiceName,
        score: score + (voice.remote ? 1 : 0),
        index
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.voiceName || "";
}

function normalizeVoiceLang(value) {
  return String(value || "")
    .trim()
    .replace(/_/g, "-")
    .toLowerCase();
}

function baseVoiceLang(value) {
  return normalizeVoiceLang(value).split("-")[0];
}
