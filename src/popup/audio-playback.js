export function createPopupAudioPlayback(options = {}) {
  const AudioCtor = options.AudioCtor || globalThis.Audio;
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  let audioPlayer = null;

  function playUrl(url, rate, fallbackToSpeech = () => {}, playbackOptions = {}) {
    if (!url || !AudioCtor) {
      return false;
    }

    stop();
    const startedAt = now();
    let fallbackStarted = false;
    const runFallback = () => {
      if (fallbackStarted) {
        return;
      }

      fallbackStarted = true;
      fallbackToSpeech();
    };

    audioPlayer = new AudioCtor(url);
    const playbackRate = playbackRateForSpeechRate(rate);
    audioPlayer.playbackRate = playbackRate;
    audioPlayer.addEventListener("error", runFallback, { once: true });
    Promise.resolve(audioPlayer.play()).then(() => {
      playbackOptions.onStart?.({
        elapsedMs: Math.max(0, now() - startedAt),
        playbackRate,
        urlHost: hostLabel(url)
      });
    }).catch(() => {
      playbackOptions.onError?.({
        elapsedMs: Math.max(0, now() - startedAt),
        urlHost: hostLabel(url)
      });
      runFallback();
    });
    return true;
  }

  function stop() {
    if (!audioPlayer) {
      return;
    }

    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer = null;
  }

  return {
    playUrl,
    stop
  };
}

export function playbackRateForSpeechRate(rate) {
  return Number(rate) < 0.7 ? 0.75 : 1;
}

function hostLabel(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
