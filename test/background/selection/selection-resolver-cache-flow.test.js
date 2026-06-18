import assert from "node:assert/strict";
import test from "node:test";
import {
  createRemoteStructuredResult
} from "../../../src/resolver-core.js";
import {
  upsertCachedResult
} from "../../../src/result/cache.js";
import {
  resolveSelection
} from "../../../src/background/selection-resolver-flow.js";

test("refreshes cached no-audio results for explicit online lookup", async () => {
  const cachedRemote = createRemoteStructuredResult("Exampletown", {
    id: "remote:exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    evidence: ["Cached source"]
  });
  const audioRemote = createRemoteStructuredResult("Exampletown", {
    id: "audio:exampletown",
    display: "Przykladowo",
    sourceForm: "Przykladowo",
    language: "pl",
    pronunciation: {
      audio: [{
        url: "https://audio.example/przykladowo.ogg",
        label: "Verified recording",
        source: "Audio source",
        quality: "verified"
      }]
    },
    sourceStatus: "verified-audio",
    evidence: ["Verified audio"]
  });
  const resultCache = upsertCachedResult({}, "Exampletown", cachedRemote);
  const calls = [];
  const storedUpdates = [];

  const result = await resolveSelection("Exampletown", { useOnline: true }, {
    loadSeedData: async () => ({ entries: [] }),
    getStorage: async () => ({
      settings: { onlineByDefault: false },
      resultCache
    }),
    setStorage: async (value) => storedUpdates.push(value),
    resolveWithOnlineSources: async (text, settings, credentials, context) => {
      calls.push({ text, contextResult: context.localResult });
      return audioRemote;
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, "Exampletown");
  assert.equal(calls[0].contextResult.sourceForm, "Przykladowo");
  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.pronunciation.audio[0].url, "https://audio.example/przykladowo.ogg");
  assert.ok(result.evidence.includes("Local lookup cache"));
  assert.ok(result.evidence.includes("Verified audio"));
  assert.ok(cacheEntries(storedUpdates[0].resultCache).some((entry) => entry.result.sourceStatus === "verified-audio"));
});

test("refreshes cached generated audio for explicit online lookup", async () => {
  const cachedGenerated = {
    id: "voice:exampletown",
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "generated-audio",
    confidence: "medium",
    pronunciation: {
      audio: [{
        url: "https://voice.example/przykladowo.ogg",
        label: "Voice service",
        source: "Voice service",
        quality: "generated"
      }]
    },
    evidence: ["Generated voice"]
  };
  const verifiedRemote = createRemoteStructuredResult("Exampletown", {
    id: "audio:exampletown",
    display: "Przykladowo",
    sourceForm: "Przykladowo",
    language: "pl",
    pronunciation: {
      audio: [{
        url: "https://audio.example/przykladowo.ogg",
        label: "Verified recording",
        source: "Audio source",
        quality: "verified"
      }]
    },
    sourceStatus: "verified-audio",
    evidence: ["Verified audio"]
  });
  const resultCache = upsertCachedResult({}, "Exampletown", cachedGenerated);
  const calls = [];
  const storedUpdates = [];

  const result = await resolveSelection("Exampletown", { useOnline: true }, {
    loadSeedData: async () => ({ entries: [] }),
    getStorage: async () => ({
      settings: { onlineByDefault: false },
      resultCache
    }),
    setStorage: async (value) => storedUpdates.push(value),
    resolveWithOnlineSources: async (text, settings, credentials, context) => {
      calls.push({ text, contextResult: context.localResult });
      return verifiedRemote;
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].contextResult.sourceStatus, "generated-audio");
  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.pronunciation.audio[0].quality, "verified");
  assert.equal(result.pronunciation.audio.at(-1).quality, "generated");
  assert.ok(cacheEntries(storedUpdates[0].resultCache).some((entry) => entry.result.sourceStatus === "verified-audio"));
});

test("refreshes cached generated audio during automatic online lookup", async () => {
  const cachedGenerated = {
    id: "voice:exampletown",
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "generated-audio",
    confidence: "medium",
    pronunciation: {
      audio: [{
        url: "https://voice.example/przykladowo.ogg",
        label: "Voice service",
        source: "Voice service",
        quality: "generated"
      }]
    },
    evidence: ["Generated voice"]
  };
  const verifiedRemote = createRemoteStructuredResult("Exampletown", {
    id: "audio:exampletown",
    display: "Przykladowo",
    sourceForm: "Przykladowo",
    language: "pl",
    pronunciation: {
      audio: [{
        url: "https://audio.example/przykladowo.ogg",
        label: "Verified recording",
        source: "Audio source",
        quality: "verified"
      }]
    },
    sourceStatus: "verified-audio",
    evidence: ["Verified audio"]
  });
  const resultCache = upsertCachedResult({}, "Exampletown", cachedGenerated);
  const calls = [];

  const result = await resolveSelection("Exampletown", {}, {
    loadSeedData: async () => ({ entries: [] }),
    getStorage: async () => ({
      settings: { onlineByDefault: false },
      resultCache
    }),
    setStorage: async () => {},
    resolveWithOnlineSources: async (text, settings, credentials, context) => {
      calls.push({ text, contextResult: context.localResult });
      return verifiedRemote;
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].contextResult.sourceStatus, "generated-audio");
  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.pronunciation.audio[0].quality, "verified");
});

test("reuses cached generated audio when refresh finds no better source", async () => {
  const cachedGenerated = {
    id: "voice:exampletown",
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "generated-audio",
    confidence: "medium",
    pronunciation: {
      audio: [{
        url: "https://cached.example/przykladowo.ogg",
        label: "Cached voice",
        source: "Voice service",
        quality: "generated"
      }]
    },
    evidence: ["Generated voice"]
  };
  const resultCache = upsertCachedResult({}, "Exampletown", cachedGenerated);
  const calls = [];
  const storedUpdates = [];

  const result = await resolveSelection("Exampletown", {}, {
    loadSeedData: async () => ({ entries: [] }),
    getStorage: async () => ({
      settings: { onlineByDefault: false },
      resultCache
    }),
    setStorage: async (value) => storedUpdates.push(value),
    resolveWithOnlineSources: async (text, settings, credentials, context) => {
      calls.push({ text, contextResult: context.localResult });
      return null;
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].contextResult.sourceStatus, "generated-audio");
  assert.equal(result.sourceStatus, "generated-audio");
  assert.equal(result.pronunciation.audio[0].url, "https://cached.example/przykladowo.ogg");
  assert.ok(cacheEntries(storedUpdates[0].resultCache).some((entry) => entry.result.pronunciation.audio[0].url === "https://cached.example/przykladowo.ogg"));
});

test("keeps cached pronunciation data when explicit online refresh fails", async () => {
  const cachedRemote = createRemoteStructuredResult("Exampletown", {
    id: "remote:exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    pronunciation: {
      simple: "p-shih-kla-doh-voh"
    },
    evidence: ["Cached source"]
  });
  const resultCache = upsertCachedResult({}, "Exampletown", cachedRemote);
  const storedUpdates = [];

  const result = await resolveSelection("Exampletown", { useOnline: true }, {
    loadSeedData: async () => ({ entries: [] }),
    getStorage: async () => ({
      settings: { onlineByDefault: false },
      resultCache
    }),
    setStorage: async (value) => storedUpdates.push(value),
    resolveWithOnlineSources: async () => {
      throw new Error("remote down");
    }
  });

  assert.equal(result.id, "remote:exampletown");
  assert.equal(result.sourceForm, "Przykladowo");
  assert.equal(result.pronunciation.simple, "p-shih-kla-doh-voh");
  assert.ok(result.evidence.includes("Local lookup cache"));
  assert.ok(result.evidence.includes("Online lookup unavailable"));
  assert.equal(storedUpdates[0].lastResult.pronunciation.simple, "p-shih-kla-doh-voh");
});

test("uses supplied local result context for online lookup", async () => {
  const supplied = createRemoteStructuredResult("Exampletown", {
    id: "supplied:exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    evidence: ["Supplied source"]
  });
  const calls = [];

  const result = await resolveSelection("Exampletown", {
    useOnline: true,
    localResult: supplied
  }, {
    loadSeedData: async () => ({ entries: [] }),
    getStorage: async () => ({
      settings: { onlineByDefault: false },
      resultCache: {}
    }),
    setStorage: async () => {},
    resolveWithOnlineSources: async (text, settings, credentials, context) => {
      calls.push({ text, contextResult: context.localResult });
      return createRemoteStructuredResult(text, {
        id: "audio:exampletown",
        display: "Przykladowo",
        sourceForm: "Przykladowo",
        language: "pl",
        pronunciation: {
          audio: [{ url: "https://audio.example/przykladowo.ogg" }]
        }
      });
    }
  });

  assert.equal(calls[0].contextResult.sourceForm, "Przykladowo");
  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.pronunciation.audio[0].url, "https://audio.example/przykladowo.ogg");
});

test("stores cacheable remote results after online lookup", async () => {
  const remote = createRemoteStructuredResult("Chiaroscuro", {
    id: "remote:chiaroscuro",
    display: "Chiaroscuro",
    sourceForm: "chiaroscuro",
    language: "it",
    pronunciation: { simple: "kee-ah-roh-SKOO-roh" },
    evidence: ["Remote source"]
  });
  const calls = [];
  const storedUpdates = [];

  const result = await resolveSelection("Chiaroscuro", { useOnline: true, languageHints: "it" }, {
    loadSeedData: async () => ({ entries: [] }),
    getStorage: async () => ({
      settings: { lookupLanguageHints: ["pl"] }
    }),
    setStorage: async (value) => storedUpdates.push(value),
    resolveWithOnlineSources: async (text, settings, credentials, context) => {
      calls.push({ text, settings, credentials, localStatus: context.localResult.sourceStatus });
      return remote;
    }
  });

  assert.equal(result.id, "remote:chiaroscuro");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, "Chiaroscuro");
  assert.deepEqual(calls[0].settings.lookupLanguageHints, ["pl", "it"]);
  assert.equal(calls[0].settings.onlineByDefault, false);
  assert.deepEqual(calls[0].credentials, { forvoApiKey: "" });
  assert.equal(calls[0].localStatus, "best-effort-fallback");
  assert.ok(cacheEntries(storedUpdates[0].resultCache).some((entry) => entry.lookupKey === "chiaroscuro"));
});

function cacheEntries(cache) {
  return Object.values(cache?.entries || {});
}
