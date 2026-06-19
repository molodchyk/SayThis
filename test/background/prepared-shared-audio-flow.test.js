import assert from "node:assert/strict";
import test from "node:test";
import {
  setTimeout as delay
} from "node:timers/promises";
import {
  clearPreparedSharedAudioForTests,
  prepareSharedAudio,
  requestPreparedOrDirectSharedAudio
} from "../../src/background/prepared-shared-audio-flow.js";

test("marks successfully preloaded generated shared audio for cached playback", async () => {
  clearPreparedSharedAudioForTests();
  const calls = [];
  const trace = {
    id: "trace-preload",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };
  const direct = {
    display: "Exampletown",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Generated shared audio",
        url: "https://audio.example/generated.mp3",
        quality: "generated"
      }]
    }
  };

  const result = await prepareSharedAudio("Exampletown", {
    trace
  }, {
    requestSharedAudio: async () => direct,
    prepareAudio: async (audio, messageTrace) => {
      calls.push(["prepareAudio", audio, messageTrace]);
      return { prepared: true };
    }
  });
  await delay(0);

  assert.equal(result, direct);
  assert.equal(direct.pronunciation.audio[0].cacheBeforePlayback, true);
  assert.deepEqual(calls, [["prepareAudio", direct.pronunciation.audio[0], trace]]);
  clearPreparedSharedAudioForTests();
});

test("falls back to a fresh direct request when prepared shared audio is slow", async () => {
  clearPreparedSharedAudioForTests();
  const direct = {
    display: "Exampletown",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Fresh shared audio",
        url: "https://audio.example/fresh.mp3",
        quality: "generated"
      }]
    }
  };
  let requestCount = 0;
  const dependencies = {
    requestSharedAudio: async () => {
      requestCount += 1;
      return requestCount === 1 ? new Promise(() => {}) : direct;
    },
    preparedSharedAudioWaitMs: 5
  };

  prepareSharedAudio("Exampletown", {}, dependencies);
  const result = await requestPreparedOrDirectSharedAudio("Exampletown", {}, dependencies);

  assert.equal(result, direct);
  assert.equal(requestCount, 2);
  clearPreparedSharedAudioForTests();
});
