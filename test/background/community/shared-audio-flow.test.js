import assert from "node:assert/strict";
import test from "node:test";
import { requestSharedAudioForResult } from "../../../src/background/community-feedback-flow.js";

test("reuses local approved shared audio by source form and stores the selected alias", async () => {
  const storage = storageHarness({
    approvedCommunityEntries: {
      existingspelling: {
        term: "Existing spelling",
        lookupKey: "existingspelling",
        sourceForm: "Przykladowo",
        aliases: ["Example alternate"],
        language: "pl",
        ttsLang: "pl-PL",
        audioUrl: "https://example.com/audio/aud_1234567890abcdef",
        sourceStatus: "generated-audio",
        trustSignals: ["moderator-reviewed", "generated-audio", "audio-backed"]
      }
    },
    settings: {}
  });
  const calls = [];
  const baseResult = resolvedStructuredResult();
  const refreshed = resolvedGeneratedAudioResult(baseResult);

  const result = await requestSharedAudioForResult("Exampletown", baseResult, {}, {
    ...storage.dependencies,
    fetch: async () => {
      throw new Error("should not fetch when source-form audio is approved locally");
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      assert.equal(storage.state.approvedCommunityEntries.exampletown.audioUrl, "https://example.com/audio/aud_1234567890abcdef");
      return refreshed;
    }
  });

  assert.equal(result, refreshed);
  assert.deepEqual(calls, [
    ["resolveSelection", "Exampletown", { useOnline: false, localResult: baseResult }]
  ]);
  assert.equal(storage.state.approvedCommunityEntries.exampletown.term, "Exampletown");
  assert.equal(storage.state.approvedCommunityEntries.exampletown.sourceForm, "Przykladowo");
  assert.equal(storage.state.approvedCommunityEntries.exampletown.ttsLang, "pl-PL");
  assert.equal(storage.state.lastResult, refreshed);
});

test("stores a selected alias when shared audio endpoint reuses a different approved key", async () => {
  const storage = storageHarness({
    approvedCommunityEntries: {},
    settings: {
      communityEndpoint: "https://example.com/community"
    }
  });
  const calls = [];
  const baseResult = resolvedStructuredResult();
  const refreshed = resolvedGeneratedAudioResult(baseResult);

  const result = await requestSharedAudioForResult("Exampletown", baseResult, {}, {
    ...storage.dependencies,
    fetch: async (url, options) => {
      calls.push(["fetch", url, JSON.parse(options.body)]);
      return {
        ok: true,
        async json() {
          return {
            entry: {
              term: "Existing spelling",
              lookupKey: "existingspelling",
              sourceForm: "Przykladowo",
              language: "pl",
              ttsLang: "pl-PL",
              audioUrl: "https://example.com/audio/aud_1234567890abcdef",
              sourceStatus: "generated-audio"
            }
          };
        }
      };
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      assert.equal(storage.state.approvedCommunityEntries.exampletown.audioUrl, "https://example.com/audio/aud_1234567890abcdef");
      return refreshed;
    }
  });

  assert.equal(result, refreshed);
  assert.equal(calls[0][0], "fetch");
  assert.equal(calls[0][2].sourceForm, "Przykladowo");
  assert.equal(storage.state.approvedCommunityEntries.existingspelling.audioUrl, "https://example.com/audio/aud_1234567890abcdef");
  assert.equal(storage.state.approvedCommunityEntries.exampletown.term, "Exampletown");
  assert.equal(storage.state.approvedCommunityEntries.exampletown.lookupKey, "exampletown");
  assert.equal(storage.state.lastResult, refreshed);
});

function resolvedStructuredResult() {
  return {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
}

function resolvedGeneratedAudioResult(baseResult) {
  return {
    ...baseResult,
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        url: "https://example.com/audio/aud_1234567890abcdef",
        quality: "generated"
      }]
    }
  };
}

function storageHarness(initial = {}) {
  const updates = [];
  const harness = {
    state: { ...initial },
    updates,
    dependencies: {
      getStorage: async (keys) => Object.fromEntries(keys.map((key) => [key, harness.state[key]])),
      setStorage: async (value) => {
        updates.push(value);
        harness.state = {
          ...harness.state,
          ...value
        };
      }
    }
  };

  return harness;
}
