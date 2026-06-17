export function createOffscreenAudioPlayback(dependencies = {}) {
  let audioPlayer = null;

  return {
    playAudio,
    stopAudio
  };

  async function playAudio(audio, playbackRate = 1) {
    const url = String(audio?.url || "");
    if (!url) {
      throw new Error("Missing audio URL.");
    }

    stopAudio();
    audioPlayer = createAudio(url, dependencies);
    audioPlayer.playbackRate = clampPlaybackRate(playbackRate);
    await audioPlayer.play();
  }

  function stopAudio() {
    if (!audioPlayer) {
      return;
    }

    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer = null;
  }
}

export function clampPlaybackRate(value) {
  const rate = Number(value || 1);
  if (!Number.isFinite(rate)) {
    return 0.5;
  }

  return Math.min(1.5, Math.max(0.5, rate));
}

function createAudio(url, dependencies = {}) {
  if (typeof dependencies.createAudio === "function") {
    return dependencies.createAudio(url);
  }

  return new Audio(url);
}
