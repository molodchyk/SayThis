import {
  createOffscreenAudioPlayback
} from "./offscreen/audio-playback-flow.js";
import {
  addOffscreenMessageListener,
  createOffscreenRuntimeAdapters
} from "./offscreen/runtime-adapters.js";
import {
  handleOffscreenAudioMessage
} from "./offscreen/runtime-message-flow.js";

const playback = createOffscreenAudioPlayback();

addOffscreenMessageListener(
  (message, sendResponse) => handleOffscreenAudioMessage(message, sendResponse, playback),
  createOffscreenRuntimeAdapters()
);
