import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPlaybackRate,
  createOffscreenAudioPlayback
} from "../../src/offscreen/audio-playback-flow.js";

test("clamps offscreen playback rate", () => {
  assert.equal(clampPlaybackRate(0.1), 0.5);
  assert.equal(clampPlaybackRate(1), 1);
  assert.equal(clampPlaybackRate(2), 1.5);
  assert.equal(clampPlaybackRate("bad"), 0.5);
});

test("plays audio through an injected audio factory", async () => {
  const calls = [];
  const playback = createOffscreenAudioPlayback({
    createAudio: (url) => {
      calls.push(["createAudio", url]);
      return {
        currentTime: 5,
        pause: () => calls.push(["pause", url]),
        play: async () => calls.push(["play", url]),
        set playbackRate(value) {
          calls.push(["playbackRate", value]);
        }
      };
    }
  });

  await playback.playAudio({ url: "https://example.test/a.ogg" }, 2);
  await playback.playAudio({ url: "https://example.test/b.ogg" }, 0.25);
  playback.stopAudio();

  assert.deepEqual(calls, [
    ["createAudio", "https://example.test/a.ogg"],
    ["playbackRate", 1.5],
    ["play", "https://example.test/a.ogg"],
    ["pause", "https://example.test/a.ogg"],
    ["createAudio", "https://example.test/b.ogg"],
    ["playbackRate", 0.5],
    ["play", "https://example.test/b.ogg"],
    ["pause", "https://example.test/b.ogg"]
  ]);
});

test("rejects playback without an audio URL", async () => {
  const playback = createOffscreenAudioPlayback();

  await assert.rejects(() => playback.playAudio({}, 1), /Missing audio URL/);
});
