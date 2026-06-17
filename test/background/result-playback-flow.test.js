import assert from "node:assert/strict";
import test from "node:test";
import {
  playAudioOffscreen,
  playResolvedResult
} from "../../src/background/result-playback-flow.js";

const AUDIO_RESULT = {
  display: "Gnocchi",
  pronunciation: {
    audio: [{ url: "https://example.test/gnocchi.ogg" }]
  }
};

test("plays verified audio through the overlay when injection succeeds", async () => {
  const calls = [];
  const result = await playResolvedResult(AUDIO_RESULT, 7, {
    getBestAudio: (value) => value.pronunciation.audio[0],
    showResultOnTab: async (tabId, value, options) => {
      calls.push(["showResultOnTab", tabId, value.display, options]);
      return true;
    },
    playAudioOffscreen: async () => {
      calls.push(["playAudioOffscreen"]);
      return true;
    },
    speakResult: () => calls.push(["speakResult"])
  });

  assert.deepEqual(result, { mode: "overlay-audio" });
  assert.deepEqual(calls, [
    ["showResultOnTab", 7, "Gnocchi", { autoPlay: true }]
  ]);
});

test("uses offscreen audio when overlay autoplay cannot be injected", async () => {
  const calls = [];
  const result = await playResolvedResult(AUDIO_RESULT, 7, {
    getBestAudio: (value) => value.pronunciation.audio[0],
    showResultOnTab: async (tabId, value, options) => {
      calls.push(["showResultOnTab", tabId, value.display, options || {}]);
      return calls.length === 1 ? false : true;
    },
    playAudioOffscreen: async (value) => {
      calls.push(["playAudioOffscreen", value.display]);
      return true;
    },
    speakResult: () => calls.push(["speakResult"])
  });

  assert.deepEqual(result, { mode: "offscreen-audio" });
  assert.deepEqual(calls, [
    ["showResultOnTab", 7, "Gnocchi", { autoPlay: true }],
    ["playAudioOffscreen", "Gnocchi"],
    ["showResultOnTab", 7, "Gnocchi", {}]
  ]);
});

test("falls back to TTS when no verified audio can play", async () => {
  const calls = [];
  const result = await playResolvedResult(AUDIO_RESULT, 7, {
    getBestAudio: (value) => value.pronunciation.audio[0],
    showResultOnTab: async (tabId, value, options) => {
      calls.push(["showResultOnTab", tabId, value.display, options || {}]);
      return false;
    },
    playAudioOffscreen: async () => false,
    speakResult: (value) => calls.push(["speakResult", value.display])
  });

  assert.deepEqual(result, { mode: "tts" });
  assert.deepEqual(calls, [
    ["showResultOnTab", 7, "Gnocchi", { autoPlay: true }],
    ["speakResult", "Gnocchi"],
    ["showResultOnTab", 7, "Gnocchi", {}]
  ]);
});

test("uses TTS directly when a result has no verified audio", async () => {
  const calls = [];
  const result = await playResolvedResult({ display: "Gnocchi" }, 7, {
    getBestAudio: () => null,
    showResultOnTab: async (tabId, value, options) => calls.push(["showResultOnTab", tabId, value.display, options || {}]),
    playAudioOffscreen: async () => {
      calls.push(["playAudioOffscreen"]);
      return true;
    },
    speakResult: (value) => calls.push(["speakResult", value.display])
  });

  assert.deepEqual(result, { mode: "tts" });
  assert.deepEqual(calls, [
    ["speakResult", "Gnocchi"],
    ["showResultOnTab", 7, "Gnocchi", {}]
  ]);
});

test("plays audio through the offscreen document with normalized rate", async () => {
  const calls = [];
  const result = await playAudioOffscreen(AUDIO_RESULT, {
    getBestAudio: (value) => value.pronunciation.audio[0],
    hasOffscreenAudioSupport: () => true,
    ensureOffscreenAudioDocument: async () => calls.push(["ensureOffscreenAudioDocument"]),
    sendOffscreenPlayAudioMessage: async (audio, rate) => {
      calls.push(["sendOffscreenPlayAudioMessage", audio.url, rate]);
      return { ok: true };
    }
  }, 0.5);

  assert.equal(result, true);
  assert.deepEqual(calls, [
    ["ensureOffscreenAudioDocument"],
    ["sendOffscreenPlayAudioMessage", "https://example.test/gnocchi.ogg", 0.75]
  ]);
});

test("does not play offscreen audio without support or a usable audio URL", async () => {
  assert.equal(await playAudioOffscreen(AUDIO_RESULT, {
    getBestAudio: (value) => value.pronunciation.audio[0],
    hasOffscreenAudioSupport: () => false
  }), false);
  assert.equal(await playAudioOffscreen({ display: "Gnocchi" }, {
    getBestAudio: () => null,
    hasOffscreenAudioSupport: () => true
  }), false);
});

test("returns false when offscreen audio playback fails", async () => {
  const result = await playAudioOffscreen(AUDIO_RESULT, {
    getBestAudio: (value) => value.pronunciation.audio[0],
    hasOffscreenAudioSupport: () => true,
    ensureOffscreenAudioDocument: async () => {},
    sendOffscreenPlayAudioMessage: async () => {
      throw new Error("blocked");
    }
  });

  assert.equal(result, false);
});
