export function createPopupAudioPlayback(options = {}) {
  const AudioCtor = options.AudioCtor || globalThis.Audio;
  let audioPlayer = null;

  function playUrl(url, rate, fallbackToSpeech = () => {}) {
    if (!url || !AudioCtor) {
      return false;
    }

    stop();
    let fallbackStarted = false;
    const runFallback = () => {
      if (fallbackStarted) {
        return;
      }

      fallbackStarted = true;
      fallbackToSpeech();
    };

    audioPlayer = new AudioCtor(url);
    audioPlayer.playbackRate = playbackRateForSpeechRate(rate);
    audioPlayer.addEventListener("error", runFallback, { once: true });
    audioPlayer.play().catch(() => {
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
