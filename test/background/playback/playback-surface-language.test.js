import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlaybackSurface
} from "../../../src/background/playback-surface-flow.js";

test("normalizes display language names before selecting TTS voices", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    getTtsVoices: async () => [
      { voiceName: "English Default", lang: "en-US" },
      { voiceName: "Polish Remote", lang: "pl-PL", remote: true }
    ],
    stopTts: () => calls.push(["stopTts"]),
    speakTts: (text, options) => calls.push(["speakTts", text, options])
  });

  const result = await surface.speakResult({
    display: "Exampletown",
    sourceForm: "Przykladowo",
    speakText: "Przykladowo",
    language: "Polish",
    ttsLang: "Polish",
    sourceStatus: "structured-source"
  }, { rate: 0.8 });

  assert.equal(result.spoken, true);
  assert.deepEqual(calls, [
    ["stopTts"],
    ["speakTts", "Przykladowo", { enqueue: false, rate: 0.8, lang: "pl-PL", voiceName: "Polish Remote" }]
  ]);
});
