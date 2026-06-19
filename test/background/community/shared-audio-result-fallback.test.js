import assert from "node:assert/strict";
import test from "node:test";
import {
  requestSharedAudioForResult
} from "../../../src/background/community-feedback-flow.js";

test("returns endpoint shared audio when refresh does not surface it", async () => {
  const storage = storageHarness({
    approvedCommunityEntries: {},
    settings: {
      communityEndpoint: "https://example.com/community"
    }
  });
  const baseResult = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source",
    pronunciation: {
      simple: "p-shih-kla-doh-voh"
    }
  };

  const result = await requestSharedAudioForResult("Exampletown", baseResult, {}, {
    ...storage.dependencies,
    fetch: async () => ({
      ok: true,
      async json() {
        return {
          entry: {
            term: "Exampletown",
            lookupKey: "exampletown",
            sourceForm: "Przykladowo",
            language: "pl",
            ttsLang: "pl-PL",
            audioUrl: "https://example.com/audio/aud_1234567890abcdef",
            sourceStatus: "generated-audio",
            trustSignals: ["service-generated", "generated-audio", "audio-backed"]
          }
        };
      }
    }),
    resolveSelection: async () => baseResult
  });

  assert.equal(result.sourceStatus, "generated-audio");
  assert.equal(result.pronunciation.audio[0].url, "https://example.com/audio/aud_1234567890abcdef");
  assert.equal(result.pronunciation.audio[0].quality, "generated");
  assert.ok(result.evidence.includes("Shared generated audio"));
  assert.equal(storage.state.lastResult.pronunciation.audio[0].url, "https://example.com/audio/aud_1234567890abcdef");
});

test("returns local approved shared audio when refresh fails", async () => {
  const storage = storageHarness({
    approvedCommunityEntries: {
      exampletown: {
        term: "Exampletown",
        lookupKey: "exampletown",
        sourceForm: "Przykladowo",
        language: "pl",
        ttsLang: "pl-PL",
        audioUrl: "https://example.com/audio/aud_1234567890abcdef",
        sourceStatus: "generated-audio",
        trustSignals: ["moderator-reviewed", "generated-audio", "audio-backed"]
      }
    },
    settings: {}
  });
  const baseResult = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };

  const result = await requestSharedAudioForResult("Exampletown", baseResult, {}, {
    ...storage.dependencies,
    fetch: async () => {
      throw new Error("should not fetch local shared audio");
    },
    resolveSelection: async () => {
      throw new Error("refresh failed");
    }
  });

  assert.equal(result.sourceStatus, "generated-audio");
  assert.equal(result.pronunciation.audio[0].url, "https://example.com/audio/aud_1234567890abcdef");
  assert.equal(storage.state.lastResult.pronunciation.audio[0].url, "https://example.com/audio/aud_1234567890abcdef");
});

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
