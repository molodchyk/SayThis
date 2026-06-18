import {
  baseVoiceLocale,
  normalizeVoiceLocale,
  preferredVoiceScoreForLabel
} from "../shared/voice-preferences.js";

export function createOffscreenAudioPlayback(dependencies = {}) {
  let audioPlayer = null;
  let audioObjectUrl = "";
  let speechUtterance = null;

  return {
    playAudio,
    speakText,
    stopAudio
  };

  async function playAudio(audio, playbackRate = 1) {
    const url = String(audio?.url || "");
    if (!url) {
      throw new Error("Missing audio URL.");
    }

    stopAudio();
    const playbackUrl = await audioUrlForPlayback(audio, dependencies);
    audioObjectUrl = playbackUrl !== url ? playbackUrl : "";
    audioPlayer = createAudio(playbackUrl, dependencies);
    audioPlayer.playbackRate = clampPlaybackRate(playbackRate);
    await audioPlayer.play();
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
      const voiceBase = baseVoiceLocale(voiceLang);
      const exactScore = voiceLang === requested ? 100 : 0;
      const baseScore = !exactScore && voiceBase === requestedBase ? 50 : 0;
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

function createAudio(url, dependencies = {}) {
  if (typeof dependencies.createAudio === "function") {
    return dependencies.createAudio(url);
  }

  return new Audio(url);
}

async function audioUrlForPlayback(audio = {}, dependencies = {}) {
  const url = String(audio.url || "");
  if (!shouldCacheAudio(audio)) {
    return url;
  }

  try {
    const response = await cachedAudioResponse(url, dependencies);
    const blob = await response?.blob?.();
    const objectUrl = blob ? createObjectUrl(blob, dependencies) : "";
    return objectUrl || url;
  } catch {
    return url;
  }
}

function shouldCacheAudio(audio = {}) {
  return String(audio.quality || "").trim().toLowerCase() === "generated";
}

async function cachedAudioResponse(url, dependencies = {}) {
  const cacheStorage = dependencies.caches || globalThis.caches;
  const fetchAudio = dependencies.fetch || globalThis.fetch?.bind(globalThis);
  if (!cacheStorage || typeof cacheStorage.open !== "function" || typeof fetchAudio !== "function") {
    return null;
  }

  const request = createRequest(url, dependencies);
  const cache = await cacheStorage.open("saythis-generated-audio-v1");
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetchAudio(request);
  if (!response?.ok) {
    return null;
  }

  await cache.put(request, response.clone ? response.clone() : response);
  return response;
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
