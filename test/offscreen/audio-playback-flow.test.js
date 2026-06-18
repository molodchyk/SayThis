import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPlaybackRate,
  clampSpeechRate,
  createOffscreenAudioPlayback,
  selectSpeechSynthesisVoice
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

test("caches generated audio before offscreen playback", async () => {
  const calls = [];
  const cacheEntries = new Map();
  const playback = createOffscreenAudioPlayback({
    createRequest: (url) => url,
    caches: {
      async open(name) {
        calls.push(["cache.open", name]);
        return {
          async match(request) {
            calls.push(["cache.match", request]);
            return cacheEntries.get(request) || null;
          },
          async put(request, response) {
            calls.push(["cache.put", request]);
            cacheEntries.set(request, response);
          }
        };
      }
    },
    fetch: async (request) => {
      calls.push(["fetch", request]);
      return responseFromBlob("audio-bytes");
    },
    createObjectUrl: (blob) => {
      calls.push(["createObjectUrl", blob]);
      return `blob:${blob}`;
    },
    revokeObjectUrl: (url) => calls.push(["revokeObjectUrl", url]),
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

  await playback.playAudio({
    url: "https://voice.example/a.ogg",
    quality: "generated"
  }, 1);
  await playback.playAudio({
    url: "https://voice.example/a.ogg",
    quality: "generated"
  }, 1);

  assert.equal(calls.filter((call) => call[0] === "fetch").length, 1);
  assert.equal(calls.filter((call) => call[0] === "cache.put").length, 1);
  assert.equal(calls.filter((call) => call[0] === "createAudio" && call[1] === "blob:audio-bytes").length, 2);
});

test("speaks source forms with matching Web Speech voices", async () => {
  const calls = [];
  const synth = {
    getVoices: () => [
      { name: "English", lang: "en-US" },
      { name: "Polish", lang: "pl-PL" }
    ],
    cancel: () => calls.push(["cancel"]),
    speak: (utterance) => {
      calls.push(["speak", utterance.text, utterance.lang, utterance.rate, utterance.voice.name]);
      utterance.onstart();
    }
  };
  function Utterance(text) {
    this.text = text;
  }
  const playback = createOffscreenAudioPlayback({
    speechSynthesis: synth,
    SpeechSynthesisUtterance: Utterance
  });

  const result = await playback.speakText("Przykladowo", {
    lang: "pl-PL",
    rate: 0.8
  });

  assert.deepEqual(result, {
    text: "Przykladowo",
    lang: "pl-PL",
    voiceName: "Polish"
  });
  assert.deepEqual(calls, [
    ["speak", "Przykladowo", "pl-PL", 0.8, "Polish"]
  ]);
});

test("selects exact Web Speech voices before base-language matches", () => {
  const voices = [
    { name: "Base", lang: "pl" },
    { name: "Exact", lang: "pl-PL" },
    { name: "Portuguese Portugal", lang: "pt-PT" }
  ];

  assert.equal(selectSpeechSynthesisVoice(voices, "pl-PL").name, "Exact");
  assert.equal(selectSpeechSynthesisVoice(voices, "pl-CA").name, "Base");
  assert.equal(selectSpeechSynthesisVoice(voices, "pt-BR"), null);
  assert.equal(selectSpeechSynthesisVoice(voices, "ja-JP"), null);
  assert.equal(clampSpeechRate(9), 1.4);
});

test("prefers configured HD browser voices for matching locales", () => {
  const voices = [
    { name: "Generic exact", lang: "uk-UA" },
    { name: "Service uk-UA-Chirp3-HD-Gacrux (Google)", lang: "uk-UA" },
    { name: "Service uk-UA-Chirp3-HD-Zephyr (Google)", lang: "uk-UA" }
  ];

  assert.equal(selectSpeechSynthesisVoice(voices, "uk-UA").name, "Service uk-UA-Chirp3-HD-Gacrux (Google)");
});

test("rejects playback without an audio URL", async () => {
  const playback = createOffscreenAudioPlayback();

  await assert.rejects(() => playback.playAudio({}, 1), /Missing audio URL/);
});

function responseFromBlob(blob) {
  return {
    ok: true,
    async blob() {
      return blob;
    },
    clone() {
      return responseFromBlob(blob);
    }
  };
}
