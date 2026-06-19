import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchApprovedCommunityEntries,
  flushCommunitySync,
  postCommunitySubmission,
  pullApprovedCommunityEntries,
  requestSharedAudioForResult,
  saveFeedback
} from "../../src/background/community-feedback-flow.js";

test("stores feedback, queues sync, schedules flush, and refreshes pronunciation data", async () => {
  const storage = storageHarness({
    communityEntries: {},
    settings: {
      communitySyncEnabled: true,
      communityEndpoint: "https://example.com/community"
    },
    syncQueue: [],
    lastResult: {
      id: "local:gnocchi",
      query: "Gnocchi",
      display: "Gnocchi",
      sourceForm: "gnocchi",
      language: "it",
      pronunciation: { simple: "NYOH-kee" }
    }
  });
  const calls = [];
  const refreshed = {
    id: "community:gnocchi",
    display: "Gnocchi",
    sourceStatus: "community-confirmed"
  };

  const result = await saveFeedback(" Gnocchi ", {
    kind: "correction",
    simple: "NYOH-kee"
  }, {
    ...storage.dependencies,
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return refreshed;
    },
    flushCommunitySync: async () => {
      calls.push(["flushCommunitySync"]);
    }
  });

  assert.equal(result, refreshed);
  assert.deepEqual(calls, [
    ["flushCommunitySync"],
    ["resolveSelection", "Gnocchi", { useOnline: false }]
  ]);
  assert.equal(storage.updates.length, 2);
  assert.equal(storage.state.communityEntries.gnocchi.simple, "NYOH-kee");
  assert.equal(storage.state.syncQueue.length, 1);
  assert.deepEqual(storage.state.syncSummary, { queued: 1, failed: 0, exhausted: 0 });
  assert.equal(storage.state.lastSelection, "Gnocchi");
  assert.equal(storage.state.lastResult.id, "community:gnocchi");
});

test("applies community summary when feedback has no pronunciation data", async () => {
  const storage = storageHarness({
    communityEntries: {},
    settings: {},
    syncQueue: [],
    lastResult: {
      id: "local:gnocchi",
      query: "Gnocchi",
      display: "Gnocchi",
      sourceStatus: "structured-source"
    }
  });

  const result = await saveFeedback("Gnocchi", { kind: "confirm" }, {
    ...storage.dependencies,
    resolveSelection: async () => {
      throw new Error("should not resolve");
    }
  });

  assert.equal(result.id, "local:gnocchi");
  assert.equal(result.community.confirmations, 1);
  assert.equal(storage.state.communityEntries.gnocchi.confirmations, 1);
  assert.deepEqual(storage.state.syncQueue, []);
});

test("flushes queued community submissions and stores the summary", async () => {
  const storage = storageHarness({
    settings: {
      communitySyncEnabled: true,
      communityEndpoint: "https://example.com/community"
    },
    syncQueue: [{
      schemaVersion: 1,
      id: "sub_gnocchi",
      createdAt: "2026-01-01T00:00:00.000Z",
      term: "Gnocchi",
      lookupKey: "gnocchi",
      kind: "confirm",
      correction: {},
      result: null,
      attempts: 0,
      lastAttemptAt: "",
      lastError: ""
    }]
  });
  const posted = [];

  const summary = await flushCommunitySync({
    ...storage.dependencies,
    postCommunitySubmission: async (endpoint, item) => {
      posted.push({ endpoint, item });
    }
  });

  assert.equal(posted.length, 1);
  assert.equal(posted[0].endpoint, "https://example.com/community");
  assert.deepEqual(summary, { queued: 0, failed: 0, exhausted: 0, sent: 1, failedThisRun: 0 });
  assert.deepEqual(storage.state.syncQueue, []);
  assert.deepEqual(storage.state.syncSummary, { queued: 0, failed: 0, exhausted: 0 });
});

test("pulls and merges approved shared entries", async () => {
  const storage = storageHarness({
    approvedCommunityEntries: {
      gnocchi: {
        lookupKey: "gnocchi",
        term: "Gnocchi",
        simple: "NYOH-kee",
        confirmations: 2
      }
    },
    settings: {
      communityPullEnabled: true,
      communityEndpoint: "https://example.com/community"
    }
  });

  const summary = await pullApprovedCommunityEntries({
    ...storage.dependencies,
    fetchApprovedCommunityEntries: async (endpoint) => {
      assert.equal(endpoint, "https://example.com/community");
      return {
        entries: {
          chiaroscuro: {
            lookupKey: "chiaroscuro",
            term: "Chiaroscuro",
            sourceForm: "chiaroscuro",
            language: "it",
            simple: "kee-ah-roh-SKOO-roh"
          }
        }
      };
    }
  });

  assert.equal(summary.received, 1);
  assert.equal(summary.total, 2);
  assert.equal(summary.skipped, false);
  assert.equal(storage.state.approvedCommunityEntries.gnocchi.simple, "NYOH-kee");
  assert.equal(storage.state.approvedCommunityEntries.chiaroscuro.language, "it");
  assert.deepEqual(storage.state.communityPullState, summary);
});

test("uses injected fetch for community HTTP helpers", async () => {
  const requests = [];
  await postCommunitySubmission("https://example.com/community", { id: "sub_1" }, {
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true };
    }
  });

  const payload = await fetchApprovedCommunityEntries("https://example.com/community?token=abc", {
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return { entries: {} };
        }
      };
    }
  });

  assert.equal(requests[0].url, "https://example.com/community");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers["Content-Type"], "application/json");
  assert.equal(JSON.parse(requests[0].options.body).id, "sub_1");
  assert.equal(requests[1].url, "https://example.com/community?token=abc&action=approved");
  assert.equal(requests[1].options.method, "GET");
  assert.equal(requests[1].options.headers.Accept, "application/json");
  assert.deepEqual(payload, { entries: {} });
});

test("requests shared audio, stores approved entry, and refreshes the result", async () => {
  const storage = storageHarness({
    approvedCommunityEntries: {},
    credentials: {
      sharedAudioGenerationToken: " client-token "
    },
    settings: {
      communityEndpoint: "https://example.com/community"
    }
  });
  const calls = [];
  const baseResult = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
  const refreshed = {
    ...baseResult,
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        url: "https://example.com/audio/aud_1234567890abcdef",
        quality: "generated"
      }]
    }
  };

  const result = await requestSharedAudioForResult("Exampletown", baseResult, { rate: 0.82 }, {
    ...storage.dependencies,
    fetch: async (url, options) => {
      calls.push(["fetch", url, JSON.parse(options.body), options.headers]);
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
              sourceStatus: "generated-audio",
              trustSignals: ["generated-audio", "audio-backed"]
            }
          };
        }
      };
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return refreshed;
    }
  });

  assert.equal(result, refreshed);
  assert.equal(calls[0][0], "fetch");
  assert.equal(calls[0][1], "https://example.com/community?action=audio");
  assert.equal(calls[0][2].sourceForm, "Przykladowo");
  assert.equal(calls[0][2].ttsLang, "pl-PL");
  assert.equal(calls[0][3].Authorization, "Bearer client-token");
  assert.equal(storage.state.approvedCommunityEntries.exampletown.sourceStatus, "generated-audio");
  assert.equal(storage.state.lastResult, refreshed);
});

test("reuses local approved shared audio before requesting the endpoint", async () => {
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
    settings: {
      communityEndpoint: "https://example.com/community"
    }
  });
  const calls = [];
  const baseResult = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
  const refreshed = {
    ...baseResult,
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        url: "https://example.com/audio/aud_1234567890abcdef",
        quality: "generated"
      }]
    }
  };

  const result = await requestSharedAudioForResult("Exampletown", baseResult, {}, {
    ...storage.dependencies,
    fetch: async () => {
      throw new Error("should not fetch shared audio that is already approved locally");
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return refreshed;
    }
  });

  assert.equal(result, refreshed);
  assert.deepEqual(calls, [
    ["resolveSelection", "Exampletown", { useOnline: false, localResult: baseResult }]
  ]);
  assert.equal(storage.updates.length, 1);
  assert.equal(storage.state.lastResult, refreshed);
});

test("reuses local approved shared audio when endpoint is not configured", async () => {
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
  const refreshed = {
    ...baseResult,
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        url: "https://example.com/audio/aud_1234567890abcdef",
        quality: "generated"
      }]
    }
  };

  const result = await requestSharedAudioForResult("Exampletown", baseResult, {}, {
    ...storage.dependencies,
    fetch: async () => {
      throw new Error("should not fetch without a configured endpoint");
    },
    resolveSelection: async () => refreshed
  });

  assert.equal(result, refreshed);
  assert.equal(storage.state.lastResult, refreshed);
});

test("does not request endpoint shared audio when shared audio is explicitly disabled", async () => {
  const storage = storageHarness({
    approvedCommunityEntries: {},
    settings: {
      communityAudioEnabled: false,
      communityEndpoint: "https://example.com/community"
    }
  });
  const baseResult = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };

  await assert.rejects(
    requestSharedAudioForResult("Exampletown", baseResult, {}, {
      ...storage.dependencies,
      fetch: async () => {
        throw new Error("should not fetch when shared audio is disabled");
      }
    }),
    /Shared audio endpoint is not enabled/
  );
});

test("does not reuse local approved shared audio with a mismatched language", async () => {
  const storage = storageHarness({
    approvedCommunityEntries: {
      exampletown: {
        term: "Exampletown",
        lookupKey: "exampletown",
        sourceForm: "Przykladowo",
        language: "it",
        ttsLang: "it-IT",
        audioUrl: "https://example.com/audio/aud_1234567890abcdef",
        sourceStatus: "generated-audio"
      }
    },
    settings: {
      communityEndpoint: "https://example.com/community"
    }
  });
  const calls = [];
  const baseResult = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
  const refreshed = {
    ...baseResult,
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        url: "https://example.com/audio/aud_new",
        quality: "generated"
      }]
    }
  };

  const result = await requestSharedAudioForResult("Exampletown", baseResult, {}, {
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
              audioUrl: "https://example.com/audio/aud_new",
              sourceStatus: "generated-audio"
            }
          };
        }
      };
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return refreshed;
    }
  });

  assert.equal(result, refreshed);
  assert.equal(calls[0][0], "fetch");
  assert.equal(calls[0][2].ttsLang, "pl-PL");
  assert.equal(storage.state.approvedCommunityEntries.exampletown.ttsLang, "pl-PL");
});

test("requests shared audio for generated-only results", async () => {
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
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        url: "https://voice.example/generated.ogg",
        quality: "generated"
      }]
    }
  };
  const refreshed = {
    ...baseResult,
    pronunciation: {
      audio: [{
        url: "https://example.com/audio/aud_1234567890abcdef",
        quality: "generated"
      }]
    }
  };

  const result = await requestSharedAudioForResult("Exampletown", baseResult, { rate: 0.82 }, {
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
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return refreshed;
    }
  });

  assert.equal(result, refreshed);
  assert.equal(calls[0][0], "fetch");
  assert.equal(calls[0][2].sourceStatus, undefined);
  assert.equal(calls[0][2].sourceForm, "Przykladowo");
  assert.equal(storage.state.approvedCommunityEntries.exampletown.audioUrl, "https://example.com/audio/aud_1234567890abcdef");
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
