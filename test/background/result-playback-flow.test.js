import assert from "node:assert/strict";
import test from "node:test";
import {
  playAudioOffscreen,
  playResolvedResult
} from "../../src/background/result-playback-flow.js";

const AUDIO_RESULT = {
  display: "Gnocchi",
  pronunciation: {
    audio: [{
      url: "https://example.test/gnocchi.ogg",
      quality: "verified"
    }]
  }
};

test("plays verified audio offscreen before showing the overlay", async () => {
  const calls = [];
  const result = await playResolvedResult(AUDIO_RESULT, 7, {
    getBestAudio: (value) => value.pronunciation.audio[0],
    hasPreferredAudio: () => true,
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

  assert.deepEqual(result, { mode: "offscreen-audio" });
  assert.deepEqual(calls, [
    ["playAudioOffscreen"],
    ["showResultOnTab", 7, "Gnocchi", undefined]
  ]);
});

test("uses overlay autoplay when offscreen cannot play verified audio", async () => {
  const calls = [];
  const result = await playResolvedResult(AUDIO_RESULT, 7, {
    getBestAudio: (value) => value.pronunciation.audio[0],
    hasPreferredAudio: () => true,
    showResultOnTab: async (tabId, value, options) => {
      calls.push(["showResultOnTab", tabId, value.display, options || {}]);
      return true;
    },
    playAudioOffscreen: async (value) => {
      calls.push(["playAudioOffscreen", value.display]);
      return false;
    },
    speakResult: () => calls.push(["speakResult"])
  });

  assert.deepEqual(result, { mode: "overlay-audio" });
  assert.deepEqual(calls, [
    ["playAudioOffscreen", "Gnocchi"],
    ["showResultOnTab", 7, "Gnocchi", { autoPlay: true }]
  ]);
});

test("uses offscreen audio before overlay autoplay for generated audio", async () => {
  const generated = {
    display: "Exampletown",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        url: "https://voice.example/example.ogg",
        quality: "generated"
      }]
    }
  };
  const calls = [];
  const result = await playResolvedResult(generated, 7, {
    getBestAudio: (value) => value.pronunciation.audio[0],
    hasPreferredAudio: () => false,
    showResultOnTab: async (tabId, value, options) => {
      calls.push(["showResultOnTab", tabId, value.display, options || {}]);
      return true;
    },
    playAudioOffscreen: async (value) => {
      calls.push(["playAudioOffscreen", value.display]);
      return true;
    },
    speakResult: () => calls.push(["speakResult"])
  });

  assert.deepEqual(result, { mode: "offscreen-audio" });
  assert.deepEqual(calls, [
    ["playAudioOffscreen", "Exampletown"],
    ["showResultOnTab", 7, "Exampletown", {}]
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
    playAudioOffscreen: async () => {
      calls.push(["playAudioOffscreen"]);
      return false;
    },
    speakResult: (value) => calls.push(["speakResult", value.display])
  });

  assert.deepEqual(result, { mode: "tts" });
  assert.deepEqual(calls, [
    ["playAudioOffscreen"],
    ["showResultOnTab", 7, "Gnocchi", { autoPlay: true }],
    ["speakResult", "Gnocchi"],
    ["showResultOnTab", 7, "Gnocchi", {}]
  ]);
});

test("does not autoplay unknown-quality audio before speech", async () => {
  const unreviewed = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    pronunciation: {
      audio: [{
        url: "https://audio.example/unreviewed.ogg"
      }]
    }
  };
  const calls = [];
  const result = await playResolvedResult(unreviewed, 7, {
    getBestAudio: (value) => value.pronunciation.audio[0],
    hasPreferredAudio: () => false,
    showResultOnTab: async (tabId, value, options) => {
      calls.push(["showResultOnTab", tabId, value.display, options || {}]);
      return true;
    },
    playAudioOffscreen: async () => {
      calls.push(["playAudioOffscreen"]);
      return true;
    },
    speakResult: async (value) => {
      calls.push(["speakResult", value.sourceForm]);
      return {
        spoken: true,
        text: value.sourceForm
      };
    }
  });

  assert.deepEqual(result, { mode: "tts" });
  assert.deepEqual(calls, [
    ["speakResult", "Przykladowo"],
    ["showResultOnTab", 7, "Exampletown", {}]
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

test("reports unavailable speech without pretending playback succeeded", async () => {
  const calls = [];
  const result = await playResolvedResult({ display: "Exampletown" }, 7, {
    getBestAudio: () => null,
    showResultOnTab: async (tabId, value, options) => calls.push(["showResultOnTab", tabId, value.display, options || {}]),
    speakResult: async () => ({
      spoken: false,
      error: "No verified browser voice for pl-PL."
    })
  });

  assert.deepEqual(result, {
    mode: "speech-unavailable",
    error: "No verified browser voice for pl-PL."
  });
  assert.deepEqual(calls, [
    ["showResultOnTab", 7, "Exampletown", {}]
  ]);
});

test("reports missing speech responses without pretending playback succeeded", async () => {
  const calls = [];
  const result = await playResolvedResult({ display: "Exampletown" }, 7, {
    getBestAudio: () => null,
    showResultOnTab: async (tabId, value, options) => calls.push(["showResultOnTab", tabId, value.display, options || {}]),
    speakResult: async () => undefined
  });

  assert.deepEqual(result, {
    mode: "speech-unavailable",
    error: "Speech unavailable."
  });
  assert.deepEqual(calls, [
    ["showResultOnTab", 7, "Exampletown", {}]
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
