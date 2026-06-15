import {
  MESSAGE_TYPES
} from "./message-contracts.js";

let audioPlayer = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.offscreenPlayAudio) {
    playAudio(message.audio, message.playbackRate)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error?.message || "Audio playback failed."
        });
      });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.offscreenStopAudio) {
    stopAudio();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

async function playAudio(audio, playbackRate = 1) {
  const url = String(audio?.url || "");
  if (!url) {
    throw new Error("Missing audio URL.");
  }

  stopAudio();
  audioPlayer = new Audio(url);
  audioPlayer.playbackRate = clamp(Number(playbackRate || 1), 0.5, 1.5);
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

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
