import assert from "node:assert/strict";
import test from "node:test";
import {
  MESSAGE_TYPES
} from "../../src/message-contracts.js";
import {
  handleOffscreenAudioMessage
} from "../../src/offscreen/runtime-message-flow.js";

test("routes offscreen play-audio messages", async () => {
  const calls = [];
  const responses = [];
  const handled = handleOffscreenAudioMessage({
    type: MESSAGE_TYPES.offscreenPlayAudio,
    audio: { url: "https://example.test/a.ogg" },
    playbackRate: 0.75
  }, (response) => responses.push(response), {
    playAudio: async (audio, playbackRate) => calls.push(["playAudio", audio, playbackRate])
  });

  await flushPromises();

  assert.equal(handled, true);
  assert.deepEqual(calls, [["playAudio", { url: "https://example.test/a.ogg" }, 0.75]]);
  assert.deepEqual(responses, [{ ok: true }]);
});

test("reports offscreen play-audio failures", async () => {
  const responses = [];
  const handled = handleOffscreenAudioMessage({
    type: MESSAGE_TYPES.offscreenPlayAudio,
    audio: {}
  }, (response) => responses.push(response), {
    playAudio: async () => {
      throw new Error("Missing audio URL.");
    }
  });

  await flushPromises();

  assert.equal(handled, true);
  assert.deepEqual(responses, [{ ok: false, error: "Missing audio URL." }]);
});

test("routes offscreen stop-audio messages", () => {
  const calls = [];
  const responses = [];
  const handled = handleOffscreenAudioMessage({
    type: MESSAGE_TYPES.offscreenStopAudio
  }, (response) => responses.push(response), {
    stopAudio: () => calls.push(["stopAudio"])
  });

  assert.equal(handled, true);
  assert.deepEqual(calls, [["stopAudio"]]);
  assert.deepEqual(responses, [{ ok: true }]);
});

test("ignores unknown offscreen messages", () => {
  assert.equal(handleOffscreenAudioMessage({ type: "OTHER" }, () => {
    throw new Error("should not respond");
  }), false);
});

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}
