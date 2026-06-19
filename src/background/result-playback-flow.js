export async function playResolvedResult(result, tabId, dependencies = {}) {
  const audio = dependencies.getBestAudio?.(result);
  if (audio && shouldAutoPlayAudio(audio, result, dependencies)) {
    if (isGeneratedAudio(audio, result)) {
      const played = await dependencies.playAudioOffscreen?.(result);
      dependencies.showResultOnTab?.(tabId, result);
      if (played) {
        return { mode: "offscreen-audio" };
      }
    } else {
      const shown = await dependencies.showResultOnTab?.(tabId, result, { autoPlay: true });
      if (shown) {
        return { mode: "overlay-audio" };
      }

      const played = await dependencies.playAudioOffscreen?.(result);
      if (played) {
        dependencies.showResultOnTab?.(tabId, result);
        return { mode: "offscreen-audio" };
      }
    }
  }

  const speech = await dependencies.speakResult?.(result);
  dependencies.showResultOnTab?.(tabId, result);
  if (!speech || speech.spoken === false) {
    return {
      mode: "speech-unavailable",
      error: speech?.error || "Speech unavailable."
    };
  }

  return { mode: speech?.fallback === "guide" ? "guide" : "tts" };
}

export async function playAudioOffscreen(result, dependencies = {}, rate = 0.82, trace) {
  const audio = dependencies.getBestAudio?.(result);
  return playAudioItemOffscreen(audio, dependencies, rate, trace);
}

export async function playAudioItemOffscreen(audio, dependencies = {}, rate = 0.82, trace) {
  if (!audio?.url || !dependencies.hasOffscreenAudioSupport?.()) {
    return false;
  }

  try {
    await dependencies.ensureOffscreenAudioDocument?.();
    const response = await dependencies.sendOffscreenPlayAudioMessage?.(
      audio,
      rate < 0.7 ? 0.75 : 1,
      trace
    );
    if (response?.playback) {
      dependencies.onOffscreenAudioDebug?.({
        ...response.playback,
        trace
      });
    }
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}

function isGeneratedAudio(audio = {}, result = {}) {
  return String(audio.quality || "").trim().toLowerCase() === "generated" ||
    result?.sourceStatus === "generated-audio";
}

function shouldAutoPlayAudio(audio = {}, result = {}, dependencies = {}) {
  if (isGeneratedAudio(audio, result)) {
    return true;
  }

  if (typeof dependencies.hasPreferredAudio === "function") {
    return dependencies.hasPreferredAudio(result);
  }

  return isPreferredAudioItem(audio, result);
}

function isPreferredAudioItem(audio = {}, result = {}) {
  const quality = String(audio.quality || "").trim().toLowerCase();
  if (!audio.url || quality === "generated") {
    return false;
  }

  return [
    "curated",
    "native",
    "native speaker",
    "native-speaker",
    "recorded",
    "source-backed",
    "verified"
  ].includes(quality) ||
    ["verified-audio", "community-confirmed"].includes(String(result?.sourceStatus || "").trim().toLowerCase());
}
