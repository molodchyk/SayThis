import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlaybackSurface
} from "../../../src/background/playback-surface-flow.js";

test("does not speak unresolved ambiguous-script fallback through a guessed voice", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    getTtsVoices: async () => [
      { voiceName: "Default", lang: "ar" }
    ],
    stopTts: () => calls.push(["stopTts"]),
    speakTts: (text, options) => calls.push(["speakTts", text, options])
  });

  const result = await surface.speakResult({
    query: "قطر",
    display: "قطر",
    sourceForm: "قطر",
    speakText: "قطر",
    sourceStatus: "generated-from-source"
  });

  assert.deepEqual(result, {
    spoken: false,
    error: "Speech unavailable without a resolved language."
  });
  assert.deepEqual(calls, []);
});
