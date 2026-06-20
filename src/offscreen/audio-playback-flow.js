import {
  baseVoiceLocale,
  normalizeVoiceLocale,
  preferredVoiceScoreForLabel,
  voiceLocaleMatchesRequest
} from "../shared/voice-preferences.js";

const MAX_PREPARED_AUDIO_OBJECT_URLS = 12;

export function createOffscreenAudioPlayback(dependencies = {}) {
  let audioPlayer = null;
  let audioObjectUrl = "";
  let speechUtterance = null;
  const audioCacheRequests = new Map();
  const audioObjectUrls = new Map();
  const audioObjectUrlRequests = new Map();
  const cacheDependencies = {
    ...dependencies,
    audioCacheRequests,
    audioObjectUrlRequests,
    audioObjectUrls
  };

  return {
    debugState,
    prepareAudio,
    playAudio,
    speakText,
    stopAudio
  };

  async function debugState(options = {}) {
    const lang = normalizeSpeechLang(options.lang);
    const synth = speechSynthesisFor(dependencies);
    const Utterance = utteranceConstructorFor(dependencies);
    const voices = synth && Utterance
      ? await speechSynthesisVoices(synth, dependencies)
      : [];
    const selectedVoice = selectSpeechSynthesisVoice(voices, lang);
    const matchingVoices = matchingSpeechSynthesisVoices(voices, lang);

    return {
      speechSynthesisAvailable: Boolean(synth),
      utteranceAvailable: Boolean(Utterance),
      preparedAudioObjectUrlCount: audioObjectUrls.size,
      pendingAudioCacheRequestCount: audioCacheRequests.size,
      pendingAudioObjectUrlCount: audioObjectUrlRequests.size,
      requestedLang: lang,
      selectedVoice: selectedVoice ? summarizeVoice(selectedVoice) : null,
      matchingVoiceCount: matchingVoices.length,
      voiceCount: voices.length,
      matchingVoices: matchingVoices.slice(0, 20),
      voices: voices.map(summarizeVoice).slice(0, 80)
    };
  }

  async function prepareAudio(audio, options = {}) {
    const startedAt = nowMs(dependencies);
    const url = String(audio?.url || "");
    if (!url) {
      throw new Error("Missing audio URL.");
    }

    try {
      const cached = await cachedAudioResponse(url, cacheDependencies);
      const preparedObjectUrl = await objectUrlForCachedResponse(url, cached.response, cacheDependencies);
      return {
        prepared: Boolean(cached.response),
        objectUrlReady: Boolean(preparedObjectUrl.url),
        elapsedMs: Math.max(0, nowMs(dependencies) - startedAt),
        cacheMode: cached.mode,
        urlHost: hostLabel(url),
        trace: options.trace
      };
    } catch {
      return {
        prepared: false,
        elapsedMs: Math.max(0, nowMs(dependencies) - startedAt),
        cacheMode: "cache-api-error",
        urlHost: hostLabel(url),
        trace: options.trace
      };
    }
  }

  async function playAudio(audio, playbackRate = 1, options = {}) {
    const startedAt = nowMs(dependencies);
    const url = String(audio?.url || "");
    if (!url) {
      throw new Error("Missing audio URL.");
    }

    stopAudio();
    const prepared = await audioUrlForPlayback(audio, cacheDependencies);
    const playbackUrl = prepared.url;
    audioObjectUrl = prepared.revokeAfterPlayback ? playbackUrl : "";
    audioPlayer = createAudio(playbackUrl, dependencies);
    audioPlayer.playbackRate = clampPlaybackRate(playbackRate);
    const playStartedAt = nowMs(dependencies);
    await audioPlayer.play();
    const completedAt = nowMs(dependencies);
    return {
      elapsedMs: Math.max(0, completedAt - startedAt),
      prepareElapsedMs: prepared.elapsedMs,
      playElapsedMs: Math.max(0, completedAt - playStartedAt),
      cacheMode: prepared.mode,
      usedObjectUrl: playbackUrl !== url,
      urlHost: hostLabel(url),
      trace: options.trace
    };
  }

  async function speakText(text, options = {}) {
    const value = normalizeSpeechText(text);
    const lang = normalizeSpeechLang(options.lang);
    if (!value) {
      throw new Error("Missing speech text.");
    }

    if (!lang) {
      throw new Error("Missing speech language.");
    }

    const synth = speechSynthesisFor(dependencies);
    const Utterance = utteranceConstructorFor(dependencies);
    if (!synth || !Utterance) {
      throw new Error("Web speech unavailable.");
    }

    const voices = await speechSynthesisVoices(synth, dependencies);
    const voice = selectSpeechSynthesisVoice(voices, lang);
    if (!voice) {
      throw new Error(`No matching browser voice for ${lang}.`);
    }

    stopAudio();
    speechUtterance = createUtterance(Utterance, value);
    speechUtterance.lang = lang;
    speechUtterance.rate = clampSpeechRate(options.rate);
    speechUtterance.voice = voice;
    await speakUtterance(synth, speechUtterance, dependencies);

    return {
      text: value,
      lang,
      voiceName: voice.name || voice.voiceName || ""
    };
  }

  function stopAudio() {
    if (!audioPlayer) {
      stopSpeech();
      return;
    }

    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer = null;
    revokeObjectUrl(audioObjectUrl, dependencies);
    audioObjectUrl = "";
    stopSpeech();
  }

  function stopSpeech() {
    const synth = speechSynthesisFor(dependencies);
    if (speechUtterance && typeof synth?.cancel === "function") {
      synth.cancel();
    }
    speechUtterance = null;
  }
}

export function clampPlaybackRate(value) {
  const rate = Number(value || 1);
  if (!Number.isFinite(rate)) {
    return 0.5;
  }

  return Math.min(1.5, Math.max(0.5, rate));
}

export function clampSpeechRate(value) {
  const rate = Number(value || 0.82);
  if (!Number.isFinite(rate)) {
    return 0.82;
  }

  return Math.min(1.4, Math.max(0.45, rate));
}

export function selectSpeechSynthesisVoice(voices = [], lang = "") {
  const requested = normalizeVoiceLocale(lang);
  const requestedBase = baseVoiceLocale(requested);
  if (!requested || !requestedBase) {
    return null;
  }

  return voices
    .map((voice, index) => {
      const voiceLang = normalizeVoiceLocale(voice?.lang);
      const exactScore = voiceLang === requested ? 100 : 0;
      const baseScore = !exactScore && voiceLocaleMatchesRequest(voiceLang, requested) ? 50 : 0;
      const score = exactScore || baseScore;
      if (!score || !(voice?.name || voice?.voiceName)) {
        return null;
      }

      return {
        voice,
        score: score + preferredVoiceScoreForLabel(`${voice?.name || ""} ${voice?.voiceName || ""}`, requested) + (voice.default ? 10 : 0),
        index
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.voice || null;
}

export function matchingSpeechSynthesisVoices(voices = [], lang = "") {
  const requested = normalizeVoiceLocale(lang);
  const requestedBase = baseVoiceLocale(requested);
  if (!requested || !requestedBase) {
    return [];
  }

  return voices
    .map((voice, index) => {
      const voiceLang = normalizeVoiceLocale(voice?.lang);
      const exactScore = voiceLang === requested ? 100 : 0;
      const baseScore = !exactScore && voiceLocaleMatchesRequest(voiceLang, requested) ? 50 : 0;
      const score = exactScore || baseScore;
      if (!score || !(voice?.name || voice?.voiceName)) {
        return null;
      }

      return {
        voice: summarizeVoice(voice),
        score: score + preferredVoiceScoreForLabel(`${voice?.name || ""} ${voice?.voiceName || ""}`, requested) + (voice.default ? 10 : 0),
        index
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ voice }) => voice);
}

function summarizeVoice(voice = {}) {
  return {
    name: normalizeSpeechText(voice.name || voice.voiceName),
    lang: normalizeSpeechLang(voice.lang),
    default: Boolean(voice.default),
    localService: typeof voice.localService === "boolean" ? voice.localService : undefined,
    voiceURI: normalizeSpeechText(voice.voiceURI)
  };
}

function createAudio(url, dependencies = {}) {
  if (typeof dependencies.createAudio === "function") {
    return dependencies.createAudio(url);
  }

  return new Audio(url);
}

async function audioUrlForPlayback(audio = {}, dependencies = {}) {
  const startedAt = nowMs(dependencies);
  const url = String(audio.url || "");
  const existingObjectUrl = cachedObjectUrlFor(url, dependencies);
  if (existingObjectUrl) {
    return {
      url: existingObjectUrl,
      elapsedMs: Math.max(0, nowMs(dependencies) - startedAt),
      mode: "memory-object-url",
      revokeAfterPlayback: false
    };
  }

  if (!shouldCacheAudio(audio)) {
    return {
      url,
      elapsedMs: Math.max(0, nowMs(dependencies) - startedAt),
      mode: "direct",
      revokeAfterPlayback: false
    };
  }

  primeAudioObjectUrl(url, dependencies);
  return {
    url,
    elapsedMs: Math.max(0, nowMs(dependencies) - startedAt),
    mode: audioCacheIsPending(url, dependencies)
      ? "cache-api-pending-direct"
      : "cache-api-prime-direct",
    revokeAfterPlayback: false
  };
}

function shouldCacheAudio(audio = {}) {
  return Boolean(audio.cacheBeforePlayback);
}

function audioCacheIsPending(url, dependencies = {}) {
  return Boolean(
    dependencies.audioCacheRequests?.has?.(url) ||
    dependencies.audioObjectUrlRequests?.has?.(url)
  );
}

function primeAudioObjectUrl(url, dependencies = {}) {
  scheduleCachePrime(async () => {
    try {
      const cached = await cachedAudioResponse(url, dependencies);
      await objectUrlForCachedResponse(url, cached.response, dependencies);
    } catch {
      // Playback already uses the direct URL; cache priming is opportunistic.
    }
  }, dependencies);
}

function scheduleCachePrime(callback, dependencies = {}) {
  const schedule = dependencies.setTimeout || globalThis.setTimeout;
  if (typeof schedule === "function") {
    schedule(callback, 0);
    return;
  }

  Promise.resolve().then(callback);
}

async function cachedAudioResponse(url, dependencies = {}) {
  const cacheStorage = dependencies.caches || globalThis.caches;
  const fetchAudio = dependencies.fetch || globalThis.fetch?.bind(globalThis);
  const requests = dependencies.audioCacheRequests;
  if (!cacheStorage || typeof cacheStorage.open !== "function" || typeof fetchAudio !== "function") {
    return {
      response: null,
      mode: "cache-api-unavailable"
    };
  }

  if (requests?.has?.(url)) {
    return cloneCachedResponse(await requests.get(url), "cache-api-in-flight");
  }

  const requestPromise = readOrFetchCachedAudio(url, dependencies, cacheStorage, fetchAudio);
  requests?.set?.(url, requestPromise);
  try {
    return await requestPromise;
  } finally {
    if (requests?.get?.(url) === requestPromise) {
      requests.delete(url);
    }
  }
}

async function readOrFetchCachedAudio(url, dependencies = {}, cacheStorage, fetchAudio) {
  const request = createRequest(url, dependencies);
  const cache = await cacheStorage.open("saythis-generated-audio-v1");
  const cached = await cache.match(request);
  if (cached) {
    return {
      response: cached,
      mode: "cache-api-hit"
    };
  }

  const response = await fetchAudio(request);
  if (!response?.ok) {
    return {
      response: null,
      mode: "cache-api-fetch-miss"
    };
  }

  await cache.put(request, response.clone ? response.clone() : response);
  return {
    response,
    mode: "cache-api-stored"
  };
}

function cloneCachedResponse(result = {}, fallbackMode = "") {
  const response = result?.response?.clone ? result.response.clone() : result?.response || null;
  return {
    response,
    mode: result?.mode === "cache-api-stored" && fallbackMode
      ? fallbackMode
      : result?.mode || fallbackMode
  };
}

async function objectUrlForCachedResponse(url, response, dependencies = {}) {
  const existingObjectUrl = cachedObjectUrlFor(url, dependencies);
  if (existingObjectUrl) {
    return {
      url: existingObjectUrl,
      fromMemory: true
    };
  }

  if (!response || typeof response.blob !== "function") {
    return {
      url: "",
      fromMemory: false
    };
  }

  const requests = dependencies.audioObjectUrlRequests;
  if (requests?.has?.(url)) {
    return {
      url: await requests.get(url),
      fromMemory: true
    };
  }

  const requestPromise = createAndRememberObjectUrl(url, response, dependencies);
  requests?.set?.(url, requestPromise);
  try {
    return {
      url: await requestPromise,
      fromMemory: false
    };
  } finally {
    if (requests?.get?.(url) === requestPromise) {
      requests.delete(url);
    }
  }
}

async function createAndRememberObjectUrl(url, response, dependencies = {}) {
  try {
    const source = response.clone ? response.clone() : response;
    const blob = await source.blob();
    const objectUrl = blob ? createObjectUrl(blob, dependencies) : "";
    return objectUrl ? rememberObjectUrl(url, objectUrl, dependencies) : "";
  } catch {
    return "";
  }
}

function cachedObjectUrlFor(url, dependencies = {}) {
  const objectUrls = dependencies.audioObjectUrls;
  const objectUrl = objectUrls?.get?.(url) || "";
  if (!objectUrl) {
    return "";
  }

  objectUrls.delete(url);
  objectUrls.set(url, objectUrl);
  return objectUrl;
}

function rememberObjectUrl(url, objectUrl, dependencies = {}) {
  const objectUrls = dependencies.audioObjectUrls;
  if (!objectUrls || typeof objectUrls.set !== "function") {
    return objectUrl;
  }

  const existingObjectUrl = objectUrls.get(url);
  if (existingObjectUrl) {
    if (existingObjectUrl !== objectUrl) {
      revokeObjectUrl(objectUrl, dependencies);
    }
    objectUrls.delete(url);
    objectUrls.set(url, existingObjectUrl);
    return existingObjectUrl;
  }

  objectUrls.set(url, objectUrl);
  while (objectUrls.size > MAX_PREPARED_AUDIO_OBJECT_URLS) {
    const oldest = objectUrls.entries().next().value;
    if (!oldest) {
      break;
    }
    const [oldestUrl, oldestObjectUrl] = oldest;
    objectUrls.delete(oldestUrl);
    revokeObjectUrl(oldestObjectUrl, dependencies);
  }

  return objectUrl;
}

function createRequest(url, dependencies = {}) {
  if (typeof dependencies.createRequest === "function") {
    return dependencies.createRequest(url);
  }

  if (typeof Request === "function") {
    return new Request(url);
  }

  return url;
}

function createObjectUrl(blob, dependencies = {}) {
  if (typeof dependencies.createObjectUrl === "function") {
    return dependencies.createObjectUrl(blob);
  }

  return globalThis.URL?.createObjectURL?.(blob) || "";
}

function revokeObjectUrl(url, dependencies = {}) {
  if (!url) {
    return;
  }

  if (typeof dependencies.revokeObjectUrl === "function") {
    dependencies.revokeObjectUrl(url);
    return;
  }

  globalThis.URL?.revokeObjectURL?.(url);
}

function nowMs(dependencies = {}) {
  return typeof dependencies.now === "function" ? dependencies.now() : Date.now();
}

function hostLabel(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function speechSynthesisFor(dependencies = {}) {
  return dependencies.speechSynthesis || globalThis.speechSynthesis;
}

function utteranceConstructorFor(dependencies = {}) {
  return dependencies.SpeechSynthesisUtterance || globalThis.SpeechSynthesisUtterance;
}

function createUtterance(Utterance, text) {
  try {
    return new Utterance(text);
  } catch {
    const utterance = new Utterance();
    utterance.text = text;
    return utterance;
  }
}

async function speechSynthesisVoices(synth, dependencies = {}) {
  const voices = Array.from(synth.getVoices?.() || []);
  if (voices.length) {
    return voices;
  }

  return waitForSpeechSynthesisVoices(synth, dependencies);
}

function waitForSpeechSynthesisVoices(synth, dependencies = {}) {
  const setTimer = dependencies.setTimeout || globalThis.setTimeout;
  const clearTimer = dependencies.clearTimeout || globalThis.clearTimeout;
  if (typeof setTimer !== "function") {
    return Promise.resolve(Array.from(synth.getVoices?.() || []));
  }

  return new Promise((resolve) => {
    let settled = false;
    let timerId;
    const previousHandler = synth.onvoiceschanged;
    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      if (typeof synth.removeEventListener === "function") {
        synth.removeEventListener("voiceschanged", finish);
      }
      if (synth.onvoiceschanged === finish) {
        synth.onvoiceschanged = previousHandler || null;
      }
      if (timerId && typeof clearTimer === "function") {
        clearTimer(timerId);
      }
      resolve(Array.from(synth.getVoices?.() || []));
    };

    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", finish, { once: true });
    } else {
      synth.onvoiceschanged = finish;
    }

    timerId = setTimer(finish, 1200);
  });
}

function speakUtterance(synth, utterance, dependencies = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const setTimer = dependencies.setTimeout || globalThis.setTimeout;
    const clearTimer = dependencies.clearTimeout || globalThis.clearTimeout;
    let timerId;
    const finish = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timerId && typeof clearTimer === "function") {
        clearTimer(timerId);
      }
      resolve(value);
    };

    utterance.onstart = () => finish(true);
    utterance.onerror = (event) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timerId && typeof clearTimer === "function") {
        clearTimer(timerId);
      }
      reject(new Error(event?.error || "Web speech failed."));
    };

    synth.speak(utterance);
    if (typeof setTimer === "function") {
      timerId = setTimer(() => finish(true), 1000);
    }
  });
}

function normalizeSpeechText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 240);
}

function normalizeSpeechLang(value) {
  return String(value || "")
    .trim()
    .replace(/_/g, "-")
    .slice(0, 32);
}
