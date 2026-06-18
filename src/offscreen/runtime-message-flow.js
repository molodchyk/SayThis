import {
  MESSAGE_TYPES
} from "../message-contracts.js";

export function handleOffscreenAudioMessage(message, sendResponse, playback = {}) {
  if (message?.type === MESSAGE_TYPES.offscreenPlayAudio) {
    playback.playAudio?.(message.audio, message.playbackRate)
      .then(() => {
        sendResponse?.({ ok: true });
      })
      .catch((error) => {
        sendResponse?.({
          ok: false,
          error: error?.message || "Audio playback failed."
        });
      });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.offscreenStopAudio) {
    playback.stopAudio?.();
    sendResponse?.({ ok: true });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.offscreenSpeak) {
    playback.speakText?.(message.text, {
      lang: message.lang,
      rate: message.rate
    })
      .then((speech) => {
        sendResponse?.({ ok: true, speech });
      })
      .catch((error) => {
        sendResponse?.({
          ok: false,
          error: error?.message || "Web speech failed."
        });
      });
    return true;
  }

  return false;
}
