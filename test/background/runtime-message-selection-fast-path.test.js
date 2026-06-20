import assert from "node:assert/strict";
import test from "node:test";
import {
  setTimeout as delay
} from "node:timers/promises";
import {
  MESSAGE_TYPES
} from "../../src/message-contracts.js";
import {
  clearPreparedSharedAudioForTests
} from "../../src/background/prepared-shared-audio-flow.js";
import {
  handleRuntimeMessage
} from "../../src/background/runtime-message-flow.js";

test("select-to-hear uses visible exact audio while speak-started shared lookup is pending", async () => {
  clearPreparedSharedAudioForTests();
  const responses = [];
  const calls = [];
  const visible = {
    display: "Exampletown",
    pronunciation: {
      audio: [{
        label: "Visible audio",
        url: "https://audio.example/visible.ogg",
        quality: "source-backed"
      }]
    }
  };
  const trace = selectionTrace("trace-visible-fast-path");

  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    rate: 0.82,
    prepareSharedAudio: true,
    trace
  }, (value) => responses.push(value), {
    getVisibleResult: async () => {
      calls.push(["getVisibleResult"]);
      return visible;
    },
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return {};
    },
    requestSharedAudio: async (text, result, options) => {
      calls.push(["requestSharedAudio", text, result, options]);
      return new Promise(() => {});
    },
    resolveSelection: async () => {
      throw new Error("visible audio should resolve before lookup fallback");
    },
    playAudio: async (audio, rate, messageTrace) => {
      calls.push(["playAudio", audio, rate, messageTrace]);
      return true;
    },
    speakResult: async () => {
      throw new Error("should not speak when visible audio plays");
    },
    directSharedAudioWaitMs: 20,
    preparedSharedAudioWaitMs: 20,
    selectionAudioFallbackWaitMs: 80,
    visibleResultGraceMs: 5,
    lastResultKey: "lastResult"
  });

  const response = await firstResponseWithin(responses, 60);

  assert.equal(handled, true);
  assert.notEqual(response, "timeout");
  assert.equal(response.ok, true);
  assert.equal(response.result, visible);
  assert.deepEqual(response.speech, {
    fallback: "audio",
    text: "Visible audio"
  });
  assert.equal(calls.some((call) => call[0] === "requestSharedAudio"), true);
  assert.equal(calls.some((call) => call[0] === "getVisibleResult"), true);
  assert.equal(calls.some((call) => call[0] === "getStorage"), false);
  assert.equal(calls.some((call) =>
    call[0] === "playAudio" &&
    call[1] === visible.pronunciation.audio[0] &&
    call[2] === 0.82 &&
    call[3] === trace
  ), true);
  clearPreparedSharedAudioForTests();
});

test("select-to-hear uses stored exact audio while speak-started shared lookup is pending", async () => {
  clearPreparedSharedAudioForTests();
  const responses = [];
  const calls = [];
  const stored = {
    display: "Exampletown",
    pronunciation: {
      audio: [{
        label: "Stored audio",
        url: "https://audio.example/stored.ogg",
        quality: "source-backed"
      }]
    }
  };
  const trace = selectionTrace("trace-stored-fast-path");

  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    rate: 0.82,
    prepareSharedAudio: true,
    trace
  }, (value) => responses.push(value), {
    getVisibleResult: async () => {
      calls.push(["getVisibleResult"]);
      return null;
    },
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return { lastResult: stored };
    },
    requestSharedAudio: async (text, result, options) => {
      calls.push(["requestSharedAudio", text, result, options]);
      return new Promise(() => {});
    },
    resolveSelection: async () => {
      throw new Error("stored audio should resolve before lookup fallback");
    },
    playAudio: async (audio, rate, messageTrace) => {
      calls.push(["playAudio", audio, rate, messageTrace]);
      return true;
    },
    speakResult: async () => {
      throw new Error("should not speak when stored audio plays");
    },
    directSharedAudioWaitMs: 20,
    preparedSharedAudioWaitMs: 20,
    selectionAudioFallbackWaitMs: 80,
    visibleResultGraceMs: 5,
    storedResultGraceMs: 5,
    lastResultKey: "lastResult"
  });

  const response = await firstResponseWithin(responses, 80);

  assert.equal(handled, true);
  assert.notEqual(response, "timeout");
  assert.equal(response.ok, true);
  assert.equal(response.result, stored);
  assert.deepEqual(response.speech, {
    fallback: "audio",
    text: "Stored audio"
  });
  assert.equal(calls.some((call) => call[0] === "requestSharedAudio"), true);
  assert.equal(calls.some((call) => call[0] === "getVisibleResult"), true);
  assert.equal(calls.some((call) =>
    call[0] === "getStorage" &&
    call[1][0] === "lastResult"
  ), true);
  assert.equal(calls.some((call) =>
    call[0] === "playAudio" &&
    call[1] === stored.pronunciation.audio[0] &&
    call[2] === 0.82 &&
    call[3] === trace
  ), true);
  clearPreparedSharedAudioForTests();
});

async function firstResponseWithin(responses, waitMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < waitMs) {
    if (responses.length) {
      return responses[0];
    }
    await delay(1);
  }
  return "timeout";
}

function selectionTrace(id) {
  return {
    id,
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };
}
