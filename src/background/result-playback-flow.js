export async function playResolvedResult(result, tabId, dependencies = {}) {
  const audio = dependencies.getBestAudio?.(result);
  if (audio) {
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

  dependencies.speakResult?.(result);
  dependencies.showResultOnTab?.(tabId, result);
  return { mode: "tts" };
}

export async function playAudioOffscreen(result, dependencies = {}, rate = 0.82) {
  const audio = dependencies.getBestAudio?.(result);
  if (!audio?.url || !dependencies.hasOffscreenAudioSupport?.()) {
    return false;
  }

  try {
    await dependencies.ensureOffscreenAudioDocument?.();
    const response = await dependencies.sendOffscreenPlayAudioMessage?.(
      audio,
      rate < 0.7 ? 0.75 : 1
    );
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}
