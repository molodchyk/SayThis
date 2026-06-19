import assert from "node:assert/strict";
import test from "node:test";
import {
  createFeedbackMessage,
  createFlushSyncMessage,
  createGetDebugStateMessage,
  createOffscreenDebugStateMessage,
  createOffscreenSpeakMessage,
  createOffscreenPlayAudioMessage,
  createOffscreenStopAudioMessage,
  createPlayAudioMessage,
  createPullApprovedMessage,
  createRequestSharedAudioMessage,
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
  assert.deepEqual(createResolveMessage("  chiaroscuro  ", {
    useOnline: true,
    languageHints: " it, pt-BR, bad!, it "
  }), {
    type: MESSAGE_TYPES.resolve,
    text: "chiaroscuro",
    useOnline: true,
    languageHints: ["it", "pt"]
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

  assert.deepEqual(createSpeakMessage(" gnocchi ", { skipSharedAudio: true }), {
    type: MESSAGE_TYPES.speak,
    text: "gnocchi",
    skipSharedAudio: true
  });
});

test("builds compact stop and sync messages", () => {
  assert.deepEqual(createStopMessage(), { type: MESSAGE_TYPES.stop });
  assert.deepEqual(createFlushSyncMessage(), { type: MESSAGE_TYPES.flushSync });
  assert.deepEqual(createPullApprovedMessage(), { type: MESSAGE_TYPES.pullApproved });
  assert.deepEqual(createGetDebugStateMessage(), { type: MESSAGE_TYPES.getDebugState });
});

test("builds shared audio request messages", () => {
  const result = {
    query: "Exampletown",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL"
  };

  assert.deepEqual(createRequestSharedAudioMessage(" Exampletown ", {
    result,
    rate: 0.2
  }), {
    type: MESSAGE_TYPES.requestSharedAudio,
    text: "Exampletown",
    result,
    rate: 0.45
  });
});

test("builds correction feedback payloads", () => {
  assert.deepEqual(createFeedbackMessage(" term ", {
    kind: "correction",
    sourceForm: " term ",
    aliases: "alias one; alias two",
    language: "en-US",
    root: "term root",
    domainHint: "science",
    variants: "studio; field",
    simple: "TERM",
    audioUrl: " https://example.com/audio.ogg ",
    sourceUrl: " https://example.com/source ",
    variantNote: "studio variant"
  }), {
    type: MESSAGE_TYPES.feedback,
    text: "term",
    feedback: {
      kind: "correction",
      sourceForm: "term",
      aliases: ["alias one", "alias two"],
      language: "en-US",
      root: "term root",
      domainHint: "science",
      variants: ["studio", "field"],
      simple: "TERM",
      audioUrl: "https://example.com/audio.ogg",
      sourceUrl: "https://example.com/source",
      variantNote: "studio variant"
    }
  });
});

test("builds structured missing feedback payloads", () => {
  assert.deepEqual(createFeedbackMessage(" term ", {
    kind: "missing",
    sourceForm: " term ",
    aliases: "alias one; alias two",
    language: "en-US",
    root: "term root",
    domainHint: "science",
    sourceUrl: " https://example.com/source "
  }), {
    type: MESSAGE_TYPES.feedback,
    text: "term",
    feedback: {
      kind: "missing",
      sourceForm: "term",
      aliases: ["alias one", "alias two"],
      language: "en-US",
      root: "term root",
      domainHint: "science",
      sourceUrl: "https://example.com/source"
    }
  });
});

test("drops invalid feedback kinds", () => {
  assert.deepEqual(createFeedbackMessage("term", { kind: "chat" }), {
    type: MESSAGE_TYPES.feedback,
    text: "term"
  });
});

test("drops unsafe correction links from runtime messages", () => {
  assert.deepEqual(createFeedbackMessage("term", {
    kind: "correction",
    simple: "TERM",
    audioUrl: "javascript:alert(1)",
    sourceUrl: "http://example.com/source"
  }), {
    type: MESSAGE_TYPES.feedback,
    text: "term",
    feedback: {
      kind: "correction",
      simple: "TERM"
    }
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
  assert.deepEqual(createOffscreenDebugStateMessage({
    lang: "pl-PL"
  }), {
    type: MESSAGE_TYPES.offscreenDebugState,
    lang: "pl-PL"
  });
  assert.deepEqual(createPlayAudioMessage(audio, { rate: 0.2 }), {
    type: MESSAGE_TYPES.playAudio,
    audio,
    rate: 0.45
  });
  assert.deepEqual(createOffscreenSpeakMessage(" Przykladowo ", {
    lang: "pl-PL",
    rate: 0.8
  }), {
    type: MESSAGE_TYPES.offscreenSpeak,
    text: "Przykladowo",
    lang: "pl-PL",
    rate: 0.8
  });
  assert.deepEqual(createOffscreenStopAudioMessage(), {
    type: MESSAGE_TYPES.offscreenStopAudio
  });
});
