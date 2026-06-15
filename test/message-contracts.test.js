import assert from "node:assert/strict";
import test from "node:test";
import {
  createFeedbackMessage,
  createFlushSyncMessage,
  createOffscreenPlayAudioMessage,
  createOffscreenStopAudioMessage,
  createPullApprovedMessage,
  createResolveMessage,
  createShowResultMessage,
  createSpeakMessage,
  createStopMessage,
  MESSAGE_TYPES
} from "../src/message-contracts.js";

test("defines unique runtime message types", () => {
  const values = Object.values(MESSAGE_TYPES);

  assert.equal(values.length, new Set(values).size);
  assert.ok(values.every((value) => value.startsWith("SAYTHIS_")));
});

test("builds a normalized resolve message", () => {
  assert.deepEqual(createResolveMessage("  chiaroscuro  "), {
    type: MESSAGE_TYPES.resolve,
    text: "chiaroscuro"
  });
  assert.deepEqual(createResolveMessage("  chiaroscuro  ", { useOnline: true }), {
    type: MESSAGE_TYPES.resolve,
    text: "chiaroscuro",
    useOnline: true
  });
  assert.deepEqual(createResolveMessage("  chiaroscuro  ", { useOnline: false }), {
    type: MESSAGE_TYPES.resolve,
    text: "chiaroscuro",
    useOnline: false
  });
});

test("builds a speak message with clamped rate and resolved result", () => {
  const result = {
    query: "gnocchi",
    sourceForm: "gnocchi"
  };

  assert.deepEqual(createSpeakMessage(" gnocchi ", {
    result,
    rate: 9,
    lang: "it-IT"
  }), {
    type: MESSAGE_TYPES.speak,
    text: "gnocchi",
    result,
    rate: 1.4,
    lang: "it-IT"
  });

  assert.deepEqual(createSpeakMessage(" gnocchi ", { useOnline: false }), {
    type: MESSAGE_TYPES.speak,
    text: "gnocchi",
    useOnline: false
  });
});

test("builds compact stop and sync messages", () => {
  assert.deepEqual(createStopMessage(), { type: MESSAGE_TYPES.stop });
  assert.deepEqual(createFlushSyncMessage(), { type: MESSAGE_TYPES.flushSync });
  assert.deepEqual(createPullApprovedMessage(), { type: MESSAGE_TYPES.pullApproved });
});

test("builds correction feedback payloads", () => {
  assert.deepEqual(createFeedbackMessage(" term ", {
    kind: "correction",
    sourceForm: " term ",
    language: "en-US",
    simple: "TERM",
    audioUrl: " https://example.com/audio.ogg ",
    variantNote: "studio variant"
  }), {
    type: MESSAGE_TYPES.feedback,
    text: "term",
    feedback: {
      kind: "correction",
      sourceForm: "term",
      language: "en-US",
      simple: "TERM",
      audioUrl: "https://example.com/audio.ogg",
      variantNote: "studio variant"
    }
  });
});

test("drops invalid feedback kinds", () => {
  assert.deepEqual(createFeedbackMessage("term", { kind: "chat" }), {
    type: MESSAGE_TYPES.feedback,
    text: "term"
  });
});

test("builds overlay and offscreen audio messages", () => {
  const result = { query: "term" };
  const audio = { url: "https://example.com/audio.ogg" };

  assert.deepEqual(createShowResultMessage(result, { autoPlay: true }), {
    type: MESSAGE_TYPES.showResult,
    result,
    autoPlay: true
  });
  assert.deepEqual(createOffscreenPlayAudioMessage(audio, 0.2), {
    type: MESSAGE_TYPES.offscreenPlayAudio,
    audio,
    playbackRate: 0.45
  });
  assert.deepEqual(createOffscreenStopAudioMessage(), {
    type: MESSAGE_TYPES.offscreenStopAudio
  });
});
