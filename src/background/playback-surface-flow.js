import {
  getBestAudio,
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

  function speakResult(result, overrides = {}) {
    const speech = resultToSpeechOptions(result, overrides);
    if (!speech.text) {
      return;
    }

    dependencies.stopTts?.();
    dependencies.speakTts?.(speech.text, speech.options);
  }

  function speakFallback(text) {
    dependencies.stopTts?.();
    dependencies.speakTts?.(text, {
      enqueue: false,
      rate: 0.82
    });
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
        files: ["src/content/overlay-style.js", "src/content/overlay-runtime-adapters.js", "src/content-overlay.js"]
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
}
