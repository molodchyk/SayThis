import assert from "node:assert/strict";
import test from "node:test";
import {
  MESSAGE_TYPES
} from "../../src/message-contracts.js";
import {
  createPlaybackSurface,
  selectTtsVoiceName
} from "../../src/background/playback-surface-flow.js";

const AUDIO_RESULT = {
  display: "Gnocchi",
  sourceForm: "gnocchi",
  ttsLang: "it-IT",
  pronunciation: {
    audio: [{ url: "https://example.test/gnocchi.ogg" }]
  }
};

test("speaks resolved results through verified TTS adapters", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    getTtsVoices: async () => [
      { voiceName: "Italian Default", lang: "it-IT" }
    ],
    stopTts: () => calls.push(["stopTts"]),
    speakTts: (text, options) => calls.push(["speakTts", text, options])
  });

  await surface.speakResult(AUDIO_RESULT, { rate: 0.7 });

  assert.deepEqual(calls, [
    ["stopTts"],
    ["speakTts", "gnocchi", { enqueue: false, rate: 0.7, lang: "it-IT", voiceName: "Italian Default" }]
  ]);
});

test("uses a matching TTS voice for resolved source forms", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    getTtsVoices: async () => [
      { voiceName: "English Default", lang: "en-US" },
      { voiceName: "Polish Local", lang: "pl" },
      { voiceName: "Polish Remote", lang: "pl-PL", remote: true }
    ],
    stopTts: () => calls.push(["stopTts"]),
    speakTts: (text, options) => calls.push(["speakTts", text, options])
  });

  const result = await surface.speakResult({
    display: "Exampletown",
    sourceForm: "Przykladowo",
    speakText: "Przykladowo",
    ttsLang: "pl-PL"
  }, { rate: 0.8 });

  assert.equal(result.spoken, true);
  assert.deepEqual(calls, [
    ["stopTts"],
    ["speakTts", "Przykladowo", { enqueue: false, rate: 0.8, lang: "pl-PL", voiceName: "Polish Remote" }]
  ]);
});

test("reports TTS adapter failures", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    getTtsVoices: async () => [
      { voiceName: "English Default", lang: "en-US" }
    ],
    stopTts: () => calls.push(["stopTts"]),
    speakTts: async (text, options) => {
      calls.push(["speakTts", text, options]);
      return {
        ok: false,
        error: "Speech engine failed."
      };
    }
  });

  const result = await surface.speakResult({
    query: "P&L",
    display: "P&L",
    sourceForm: "P N L",
    speakText: "P N L",
    ttsLang: "en-US",
    sourceStatus: "structured-source"
  });

  assert.deepEqual(result, {
    spoken: false,
    error: "Speech engine failed."
  });
  assert.deepEqual(calls, [
    ["stopTts"],
    ["speakTts", "P N L", { enqueue: false, rate: 0.82, lang: "en-US", voiceName: "English Default" }]
  ]);
});

test("reports missing speech text as unavailable", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    stopTts: () => calls.push(["stopTts"]),
    speakTts: (text, options) => calls.push(["speakTts", text, options])
  });

  const result = await surface.speakResult({});

  assert.deepEqual(result, {
    spoken: false,
    error: "Speech unavailable."
  });
  assert.deepEqual(calls, []);
});

test("does not speak unresolved Latin text with raw browser TTS", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    getTtsVoices: async () => [
      { voiceName: "English Default", lang: "en-US" }
    ],
    stopTts: () => calls.push(["stopTts"]),
    speakTts: (text, options) => calls.push(["speakTts", text, options])
  });

  const result = await surface.speakResult({
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    speakText: "Exampleterm",
    ttsLang: "en-US",
    sourceStatus: "best-effort-fallback"
  });

  assert.deepEqual(result, {
    spoken: false,
    error: "Speech unavailable for unresolved text."
  });
  assert.deepEqual(calls, []);
});

test("does not speak structured results through the default browser voice without a locale", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    getTtsVoices: async () => [
      { voiceName: "English Default", lang: "en-US" }
    ],
    stopTts: () => calls.push(["stopTts"]),
    speakTts: (text, options) => calls.push(["speakTts", text, options])
  });

  const result = await surface.speakResult({
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    speakText: "Exampleterm",
    sourceStatus: "structured-source"
  });

  assert.deepEqual(result, {
    spoken: false,
    error: "Speech unavailable without a resolved language."
  });
  assert.deepEqual(calls, []);
});

test("does not speak plain same-text English structured results with browser TTS", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    getTtsVoices: async () => [
      { voiceName: "English Default", lang: "en-US" }
    ],
    stopTts: () => calls.push(["stopTts"]),
    speakTts: (text, options) => calls.push(["speakTts", text, options])
  });

  const result = await surface.speakResult({
    query: "Exampleterm",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    speakText: "Exampleterm",
    ttsLang: "en-US",
    sourceStatus: "structured-source"
  });

  assert.deepEqual(result, {
    spoken: false,
    error: "Speech unavailable for plain English text without a guide."
  });
  assert.deepEqual(calls, []);
});

test("still speaks unresolved abbreviation guides", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    getTtsVoices: async () => [
      { voiceName: "English Default", lang: "en-US" }
    ],
    stopTts: () => calls.push(["stopTts"]),
    speakTts: (text, options) => calls.push(["speakTts", text, options])
  });

  const result = await surface.speakResult({
    display: "P&L",
    sourceForm: "P&L",
    speakText: "P N L",
    ttsLang: "en-US",
    sourceStatus: "best-effort-fallback",
    pronunciation: {
      simple: "P N L"
    }
  });

  assert.deepEqual(result, {
    spoken: true,
    text: "P N L",
    options: {
      enqueue: false,
      rate: 0.82,
      lang: "en-US",
      voiceName: "English Default"
    }
  });
  assert.deepEqual(calls, [
    ["stopTts"],
    ["speakTts", "P N L", { enqueue: false, rate: 0.82, lang: "en-US", voiceName: "English Default" }]
  ]);
});

test("does not speak with a known non-matching TTS voice", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    getTtsVoices: async () => [
      { voiceName: "English Default", lang: "en-US" }
    ],
    stopTts: () => calls.push(["stopTts"]),
    speakTts: (text, options) => calls.push(["speakTts", text, options])
  });

  const result = await surface.speakResult({
    display: "Exampletown",
    sourceForm: "Przykladowo",
    speakText: "Przykladowo",
    ttsLang: "pl-PL"
  });

  assert.deepEqual(result, {
    spoken: false,
    error: "No verified browser voice for pl-PL."
  });
  assert.deepEqual(calls, []);
});

test("uses offscreen Web Speech when extension TTS lacks a matching voice", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    hasOffscreenAudioSupport: () => true,
    hasOffscreenDocument: () => true,
    getTtsVoices: async () => [
      { voiceName: "English Default", lang: "en-US" }
    ],
    sendRuntimeMessage: async (message) => {
      calls.push(["sendRuntimeMessage", message]);
      return {
        ok: true,
        speech: {
          text: "Przykladowo",
          voiceName: "Polish Web Voice"
        }
      };
    },
    stopTts: () => calls.push(["stopTts"]),
    speakTts: () => {
      throw new Error("should not use extension TTS");
    }
  });

  const result = await surface.speakResult({
    display: "Exampletown",
    sourceForm: "Przykladowo",
    speakText: "Przykladowo",
    ttsLang: "pl-PL"
  }, { rate: 0.8 });

  assert.equal(result.spoken, true);
  assert.equal(result.fallback, "web-speech");
  assert.equal(result.options.voiceName, "Polish Web Voice");
  assert.equal(calls[0][0], "sendRuntimeMessage");
  assert.equal(calls[0][1].type, "SAYTHIS_OFFSCREEN_SPEAK");
  assert.equal(calls[0][1].text, "Przykladowo");
  assert.equal(calls[0][1].lang, "pl-PL");
});

test("does not speak non-English source forms through unverified TTS", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    stopTts: () => calls.push(["stopTts"]),
    speakTts: (text, options) => calls.push(["speakTts", text, options])
  });

  const result = await surface.speakResult({
    display: "Exampletown",
    sourceForm: "Przykladowo",
    speakText: "Przykladowo",
    ttsLang: "pl-PL"
  });

  assert.deepEqual(result, {
    spoken: false,
    error: "No verified browser voice for pl-PL."
  });
  assert.deepEqual(calls, []);
});

test("speaks a guide when the resolved locale voice is missing", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    getTtsVoices: async () => [
      { voiceName: "English Default", lang: "en-US" }
    ],
    stopTts: () => calls.push(["stopTts"]),
    speakTts: (text, options) => calls.push(["speakTts", text, options])
  });

  const result = await surface.speakResult({
    display: "Exampletown",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL",
    pronunciation: {
      simple: "p-shih-kla-doh-voh"
    }
  }, { rate: 0.8 });

  assert.deepEqual(result, {
    spoken: true,
    text: "p-shih-kla-doh-voh",
    options: {
      enqueue: false,
      rate: 0.8,
      lang: "en-US",
      voiceName: "English Default"
    },
    fallback: "guide"
  });
  assert.deepEqual(calls, [
    ["stopTts"],
    ["speakTts", "p-shih-kla-doh-voh", { enqueue: false, rate: 0.8, lang: "en-US", voiceName: "English Default" }]
  ]);
});

test("does not speak explanatory guide prose when the resolved locale voice is missing", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    getTtsVoices: async () => [
      { voiceName: "English Default", lang: "en-US" }
    ],
    stopTts: () => calls.push(["stopTts"]),
    speakTts: (text, options) => calls.push(["speakTts", text, options])
  });

  const result = await surface.speakResult({
    display: "Exampletown",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL",
    pronunciation: {
      simple: "English pronunciations vary; source form should use a matching voice"
    }
  }, { rate: 0.8 });

  assert.deepEqual(result, {
    spoken: false,
    error: "No verified browser voice for pl-PL."
  });
  assert.deepEqual(calls, []);
});

test("prefers guide speech when the target voice cannot be verified", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    getTtsVoices: async () => [],
    stopTts: () => calls.push(["stopTts"]),
    speakTts: (text, options) => calls.push(["speakTts", text, options])
  });

  const result = await surface.speakResult({
    display: "Exampletown",
    sourceForm: "Przykladowo",
    speakText: "Przykladowo",
    ttsLang: "pl-PL",
    pronunciation: {
      simple: "p-shih-kla-doh-voh"
    }
  }, { rate: 0.8 });

  assert.deepEqual(result, {
    spoken: true,
    text: "p-shih-kla-doh-voh",
    options: {
      enqueue: false,
      rate: 0.8,
      lang: "en-US"
    },
    fallback: "guide"
  });
  assert.deepEqual(calls, [
    ["stopTts"],
    ["speakTts", "p-shih-kla-doh-voh", { enqueue: false, rate: 0.8, lang: "en-US" }]
  ]);
});

test("selects exact and base-language TTS voices deterministically", () => {
  const voices = [
    { voiceName: "English Default", lang: "en-US" },
    { voiceName: "Polish Base", lang: "pl" },
    { voiceName: "Polish Exact", lang: "pl-PL" },
    { voiceName: "Portuguese Portugal", lang: "pt-PT" }
  ];

  assert.equal(selectTtsVoiceName(voices, "pl-PL"), "Polish Exact");
  assert.equal(selectTtsVoiceName(voices, "pl-CA"), "Polish Base");
  assert.equal(selectTtsVoiceName(voices, "pt-BR"), "");
  assert.equal(selectTtsVoiceName(voices, "ja-JP"), "");
});

test("prefers configured HD extension TTS voices for matching locales", () => {
  const voices = [
    { voiceName: "Generic exact", lang: "uk-UA", remote: true },
    { voiceName: "Service uk-UA-Chirp3-HD-Zephyr (Google)", lang: "uk-UA", remote: true },
    { voiceName: "Service uk-UA-Chirp3-HD-Gacrux (Google)", lang: "uk-UA" }
  ];

  assert.equal(selectTtsVoiceName(voices, "uk-UA"), "Service uk-UA-Chirp3-HD-Gacrux (Google)");
});

test("injects the overlay and sends result messages when enabled", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    getStorage: async () => ({
      settings: { showOverlay: true }
    }),
    executeScript: async (details) => calls.push(["executeScript", details]),
    sendTabMessage: async (tabId, message) => calls.push(["sendTabMessage", tabId, message])
  });

  const shown = await surface.showResultOnTab(7, AUDIO_RESULT, { autoPlay: true });

  assert.equal(shown, true);
  assert.deepEqual(calls[0], ["executeScript", {
    target: { tabId: 7 },
    files: ["src/content/overlay-style.js", "src/content/overlay-runtime-adapters.js", "src/content/overlay-result-view.js", "src/content-overlay.js"]
  }]);
  assert.equal(calls[1][0], "sendTabMessage");
  assert.equal(calls[1][1], 7);
  assert.equal(calls[1][2].type, MESSAGE_TYPES.showResult);
  assert.equal(calls[1][2].autoPlay, true);
  assert.equal(calls[1][2].result.display, "Gnocchi");
});

test("does not inject the overlay when disabled or target data is missing", async () => {
  const surface = createPlaybackSurface({
    getStorage: async () => ({
      settings: { showOverlay: false }
    }),
    executeScript: async () => {
      throw new Error("should not inject");
    }
  });

  assert.equal(await surface.showResultOnTab(7, AUDIO_RESULT), false);
  assert.equal(await surface.showResultOnTab(0, AUDIO_RESULT), false);
  assert.equal(await surface.showResultOnTab(7, null), false);
});

test("plays verified audio through the offscreen document", async () => {
  const calls = [];
  let hasDocument = false;
  const surface = createPlaybackSurface({
    hasOffscreenAudioSupport: () => true,
    hasOffscreenDocument: () => hasDocument,
    createOffscreenDocument: async (options) => {
      calls.push(["createOffscreenDocument", options]);
      hasDocument = true;
    },
    sendRuntimeMessage: async (message) => {
      calls.push(["sendRuntimeMessage", message]);
      return { ok: true };
    }
  });

  assert.equal(await surface.playAudioOffscreen(AUDIO_RESULT, 0.5), true);
  await surface.ensureOffscreenAudioDocument();

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ["createOffscreenDocument", {
    url: "src/offscreen-audio.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play pronunciation audio and matching voice speech when a page overlay is unavailable."
  }]);
  assert.equal(calls[1][0], "sendRuntimeMessage");
  assert.equal(calls[1][1].type, MESSAGE_TYPES.offscreenPlayAudio);
  assert.equal(calls[1][1].audio.url, "https://example.test/gnocchi.ogg");
  assert.equal(calls[1][1].playbackRate, 0.75);
});

test("can detect an offscreen document through matched clients", async () => {
  const surface = createPlaybackSurface({
    offscreenAudioUrl: "src/offscreen-audio.html",
    getRuntimeUrl: (url) => `chrome-extension://saythis/${url}`,
    matchClients: async () => [
      { url: "https://example.test/page" },
      { url: "chrome-extension://saythis/src/offscreen-audio.html" }
    ]
  });

  assert.equal(await surface.hasOffscreenAudioDocument(), true);
});

test("stops TTS and offscreen audio, ignoring missing offscreen documents", async () => {
  const calls = [];
  const surface = createPlaybackSurface({
    hasOffscreenAudioSupport: () => true,
    stopTts: () => calls.push(["stopTts"]),
    sendRuntimeMessage: async (message) => {
      calls.push(["sendRuntimeMessage", message]);
      throw new Error("missing offscreen document");
    }
  });

  await surface.stopPlayback();

  assert.deepEqual(calls, [
    ["stopTts"],
    ["sendRuntimeMessage", { type: MESSAGE_TYPES.offscreenStopAudio }]
  ]);
});
