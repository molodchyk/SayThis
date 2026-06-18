import assert from "node:assert/strict";
import test from "node:test";
import { requestSharedAudioForResult } from "../../../src/background/community-feedback-flow.js";

test("does not request shared audio for same-text English structured results", async () => {
  const storage = storageHarness({
    approvedCommunityEntries: {},
    settings: {
      communityEndpoint: "https://example.com/community"
    }
  });
  const baseResult = {
    query: "Exampleterm",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "en",
    ttsLang: "en-US",
    sourceStatus: "structured-source"
  };

  await assert.rejects(
    requestSharedAudioForResult("Exampleterm", baseResult, {}, {
      ...storage.dependencies,
      fetch: async () => {
        throw new Error("should not request generated audio for same-text English");
      },
      resolveSelection: async () => {
        throw new Error("should not refresh after a rejected shared-audio request");
      }
    }),
    /useful resolved source form/
  );
});

test("requests shared audio for resolved same-language source-form differences", async () => {
  const storage = storageHarness({
    approvedCommunityEntries: {},
    settings: {
      communityEndpoint: "https://example.com/community"
    }
  });
  const calls = [];
  const baseResult = {
    query: "P&L",
    display: "P&L",
    sourceForm: "P N L",
    language: "en",
    ttsLang: "en-US",
    sourceStatus: "structured-source"
  };

  await requestSharedAudioForResult("P&L", baseResult, {}, {
    ...storage.dependencies,
    fetch: async (url, options) => {
      calls.push(["fetch", url, JSON.parse(options.body)]);
      return {
        ok: true,
        async json() {
          return {
            entry: {
              term: "P&L",
              lookupKey: "pl",
              sourceForm: "P N L",
              language: "en",
              ttsLang: "en-US",
              audioUrl: "https://example.com/audio/aud_1234567890abcdef",
              sourceStatus: "generated-audio"
            }
          };
        }
      };
    },
    resolveSelection: async () => baseResult
  });

  assert.equal(calls[0][2].sourceForm, "P N L");
  assert.equal(calls[0][2].ttsLang, "en-US");
});

test("includes aliases and variants in shared audio requests", async () => {
  const storage = storageHarness({
    approvedCommunityEntries: {},
    settings: {
      communityEndpoint: "https://example.com/community"
    }
  });
  const calls = [];
  const baseResult = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    aliases: ["Example alternate", "Shared spelling"],
    variants: ["Regional reading"],
    language: "pl",
    languageName: "Polish",
    origin: "sample source",
    root: "przyklad",
    domainHint: "field term",
    ttsLang: "pl-PL",
    pronunciation: {
      ipa: "pʂɨkˈwadɔvɔ",
      simple: "pshih-KWAH-doh-vo"
    },
    sourceStatus: "structured-source",
    variantNote: "regional reading note",
    trustSignals: ["source-backed", "root-noted"],
    sources: [{ label: "Example source", url: "https://source.example/przykladowo" }]
  };

  await requestSharedAudioForResult("Exampletown", baseResult, {}, {
    ...storage.dependencies,
    fetch: async (url, options) => {
      calls.push(["fetch", url, JSON.parse(options.body)]);
      return {
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
              sourceStatus: "generated-audio"
            }
          };
        }
      };
    },
    resolveSelection: async () => baseResult
  });

  assert.deepEqual(calls[0][2].aliases, ["Example alternate", "Shared spelling"]);
  assert.deepEqual(calls[0][2].variants, ["Regional reading"]);
  assert.equal(calls[0][2].languageName, "Polish");
  assert.equal(calls[0][2].origin, "sample source");
  assert.equal(calls[0][2].root, "przyklad");
  assert.equal(calls[0][2].domainHint, "field term");
  assert.equal(calls[0][2].ipa, "pʂɨkˈwadɔvɔ");
  assert.equal(calls[0][2].simple, "pshih-KWAH-doh-vo");
  assert.equal(calls[0][2].sourceUrl, "https://source.example/przykladowo");
  assert.equal(calls[0][2].variantNote, "regional reading note");
  assert.deepEqual(calls[0][2].trustSignals, ["source-backed", "root-noted"]);
});

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

test("reuses local approved shared audio by alias and variant request keys", async () => {
  const storage = storageHarness({
    approvedCommunityEntries: {
      sharedspelling: {
        term: "Shared spelling",
        lookupKey: "sharedspelling",
        sourceForm: "Approved form",
        aliases: ["Shared alias"],
        variants: ["Shared variant"],
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
    aliases: ["Shared alias"],
    variants: ["Shared variant"],
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
  const refreshed = resolvedGeneratedAudioResult(baseResult);

  const result = await requestSharedAudioForResult("Exampletown", baseResult, {}, {
    ...storage.dependencies,
    fetch: async () => {
      throw new Error("should not fetch when alias or variant audio is approved locally");
    },
    resolveSelection: async () => refreshed
  });

  assert.equal(result, refreshed);
  assert.equal(storage.state.approvedCommunityEntries.exampletown.audioUrl, "https://example.com/audio/aud_1234567890abcdef");
  assert.equal(storage.state.approvedCommunityEntries.exampletown.sourceForm, "Approved form");
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
