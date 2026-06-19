import assert from "node:assert/strict";
import test from "node:test";
import {
  createRemoteStructuredResult
} from "../../src/resolver-core.js";
import {
  upsertCachedResult
} from "../../src/result/cache.js";
import {
  onlineSettingsForRequest,
  resolveSelection
} from "../../src/background/selection-resolver-flow.js";

const ENTRY_DATA = {
  entries: [{
    id: "gnocchi",
    language: "it",
    languageName: "Italian",
    display: "Gnocchi",
    sourceForm: "gnocchi",
    aliases: ["Gnocchi"],
    category: "term",
    pronunciation: {
      simple: "NYOH-kee",
      audio: [{
        url: "assets/audio/public/gnocchi.ogg",
        label: "Sample",
        source: "Packaged",
        quality: "verified"
      }]
    },
    sourceStatus: "verified-audio",
    confidence: "high",
    evidence: ["Bundled sample entry"]
  }]
};

test("resolves local entries, maps packaged audio URLs, and stores the result", async () => {
  const storedUpdates = [];
  const result = await resolveSelection(" Gnocchi ", {}, {
    loadSeedData: async () => ENTRY_DATA,
    getStorage: async () => ({}),
    setStorage: async (value) => storedUpdates.push(value),
    getRuntimeUrl: (url) => `chrome-extension://saythis/${url}`
  });

  assert.equal(result.id, "gnocchi");
  assert.equal(result.pronunciation.audio[0].url, "chrome-extension://saythis/assets/audio/public/gnocchi.ogg");
  assert.equal(storedUpdates.length, 1);
  assert.equal(storedUpdates[0].lastSelection, "Gnocchi");
  assert.equal(storedUpdates[0].lastResult.id, "gnocchi");
  assert.equal("resultCache" in storedUpdates[0], false);
});

test("uses cached online results before remote lookup", async () => {
  const remote = createRemoteStructuredResult("Athens", {
    id: "remote:athens",
    display: "Athens",
    sourceForm: "Αθήνα",
    language: "el",
    pronunciation: { simple: "ah-THEE-nah" },
    evidence: ["Remote source"]
  });
  const resultCache = upsertCachedResult({}, "Athens", remote);
  const storedUpdates = [];

  const result = await resolveSelection("Athens", {}, {
    loadSeedData: async () => ({ entries: [] }),
    getStorage: async () => ({
      settings: { onlineByDefault: true },
      resultCache
    }),
    setStorage: async (value) => storedUpdates.push(value),
    resolveWithOnlineSources: async () => {
      throw new Error("remote should not be called");
    }
  });

  assert.equal(result.id, "remote:athens");
  assert.equal(result.sourceForm, "Αθήνα");
  assert.equal(result.evidence[0], "Local lookup cache");
  assert.ok(storedUpdates[0].resultCache.entries.athens);
});

test("checks online sources when local lookup lacks pronunciation", async () => {
  const calls = [];
  const storedUpdates = [];

  const result = await resolveSelection("Exampletown", {}, {
    loadSeedData: async () => ({ entries: [] }),
    getStorage: async () => ({
      settings: { onlineByDefault: false }
    }),
    setStorage: async (value) => storedUpdates.push(value),
    resolveWithOnlineSources: async (text, settings, credentials, context) => {
      calls.push({ text, settings, credentials, localStatus: context.localResult.sourceStatus });
      return createRemoteStructuredResult(text, {
        id: "remote:exampletown",
        display: "Exampletown",
        sourceForm: "\u041a\u0430\u043b\u0438\u043d\u0435",
        language: "uk",
        evidence: ["Remote source"]
      });
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, "Exampletown");
  assert.equal(calls[0].localStatus, "best-effort-fallback");
  assert.equal(result.id, "remote:exampletown");
  assert.equal(result.language, "uk");
  assert.equal(result.pronunciation.simple, "kah-lih-neh");
  assert.ok(cacheEntries(storedUpdates[0].resultCache).some((entry) => entry.lookupKey === "exampletown"));
});

test("checks online sources for best-effort initialism guides", async () => {
  const calls = [];
  const storedUpdates = [];

  const result = await resolveSelection("PnL", {}, {
    loadSeedData: async () => ({ entries: [] }),
    getStorage: async () => ({
      settings: { onlineByDefault: false }
    }),
    setStorage: async (value) => storedUpdates.push(value),
    resolveWithOnlineSources: async (text, settings, credentials, context) => {
      calls.push({ text, localResult: context.localResult });
      return null;
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, "PnL");
  assert.equal(calls[0].localResult.pronunciation.simple, "P and L");
  assert.equal(result.sourceStatus, "best-effort-fallback");
  assert.equal(result.speakText, "P and L");
  assert.ok(cacheEntries(storedUpdates[0].resultCache).length === 0);
});

test("checks online sources for structured guide-only local entries", async () => {
  const calls = [];
  const storedUpdates = [];
  const guideOnlyData = {
    entries: [{
      id: "sampleterm",
      display: "Sampleterm",
      sourceForm: "Sampleterm",
      language: "it",
      pronunciation: {
        simple: "SAM-pluh-term"
      },
      sourceStatus: "structured-source",
      confidence: "medium"
    }]
  };

  const result = await resolveSelection("Sampleterm", {}, {
    loadSeedData: async () => guideOnlyData,
    getStorage: async () => ({
      settings: { onlineByDefault: false }
    }),
    setStorage: async (value) => storedUpdates.push(value),
    resolveWithOnlineSources: async (text, settings, credentials, context) => {
      calls.push({ text, contextResult: context.localResult });
      return createRemoteStructuredResult(text, {
        id: "audio:sampleterm",
        display: "Sampleterm",
        sourceForm: "Sampleterm",
        language: "it",
        pronunciation: {
          audio: [{
            url: "https://audio.example/sampleterm.ogg",
            label: "Verified recording",
            source: "Audio source",
            quality: "verified"
          }]
        },
        sourceStatus: "verified-audio",
        evidence: ["Verified audio"]
      });
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, "Sampleterm");
  assert.equal(calls[0].contextResult.id, "sampleterm");
  assert.equal(calls[0].contextResult.pronunciation.simple, "SAM-pluh-term");
  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.pronunciation.audio[0].url, "https://audio.example/sampleterm.ogg");
  assert.equal(result.pronunciation.simple, "SAM-pluh-term");
  assert.ok(cacheEntries(storedUpdates[0].resultCache).some((entry) => entry.result.sourceStatus === "verified-audio"));
});

test("refreshes cached no-audio results for structured guide-only local entries", async () => {
  const calls = [];
  const storedUpdates = [];
  const guideOnlyData = {
    entries: [{
      id: "sampleterm",
      display: "Sampleterm",
      sourceForm: "Sampleterm",
      language: "it",
      pronunciation: {
        simple: "SAM-pluh-term"
      },
      sourceStatus: "structured-source",
      confidence: "medium"
    }]
  };
  const cachedRemote = createRemoteStructuredResult("Sampleterm", {
    id: "remote:sampleterm",
    display: "Sampleterm",
    sourceForm: "Sampleterm",
    language: "it",
    pronunciation: {
      simple: "SAM-pluh-term"
    },
    evidence: ["Cached no-audio source"]
  });
  const audioRemote = createRemoteStructuredResult("Sampleterm", {
    id: "audio:sampleterm",
    display: "Sampleterm",
    sourceForm: "Sampleterm",
    language: "it",
    pronunciation: {
      audio: [{
        url: "https://audio.example/sampleterm.ogg",
        label: "Verified recording",
        source: "Audio source",
        quality: "verified"
      }]
    },
    sourceStatus: "verified-audio",
    evidence: ["Verified audio"]
  });
  const resultCache = upsertCachedResult({}, "Sampleterm", cachedRemote);

  const result = await resolveSelection("Sampleterm", {}, {
    loadSeedData: async () => guideOnlyData,
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
  assert.equal(calls[0].contextResult.id, "sampleterm");
  assert.equal(calls[0].contextResult.pronunciation.simple, "SAM-pluh-term");
  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.pronunciation.audio[0].url, "https://audio.example/sampleterm.ogg");
  assert.ok(result.evidence.includes("Local lookup cache"));
  assert.ok(result.evidence.includes("Verified audio"));
  assert.ok(cacheEntries(storedUpdates[0].resultCache).some((entry) => entry.result.sourceStatus === "verified-audio"));
});

test("keeps explicit local lookup local even without pronunciation", async () => {
  const storedUpdates = [];
  const result = await resolveSelection("Exampletown", { useOnline: false }, {
    loadSeedData: async () => ({ entries: [] }),
    getStorage: async () => ({
      settings: { onlineByDefault: false }
    }),
    setStorage: async (value) => storedUpdates.push(value),
    resolveWithOnlineSources: async () => {
      throw new Error("remote should not be called");
    }
  });

  assert.equal(result.sourceStatus, "best-effort-fallback");
  assert.equal("resultCache" in storedUpdates[0], false);
});

test("keeps local result with evidence when online lookup fails", async () => {
  const result = await resolveSelection("Gnocchi", { useOnline: true }, {
    loadSeedData: async () => ENTRY_DATA,
    getStorage: async () => ({}),
    setStorage: async () => {},
    resolveWithOnlineSources: async () => {
      throw new Error("offline");
    }
  });

  assert.equal(result.id, "gnocchi");
  assert.ok(result.evidence.includes("Online lookup unavailable"));
});

test("merges request language hints into saved settings for one lookup", () => {
  assert.deepEqual(onlineSettingsForRequest({
    lookupLanguageHints: ["pl"],
    onlineByDefault: false
  }, {
    languageHints: "it, ja, it"
  }), {
    lookupLanguageHints: ["pl", "it", "ja"],
    onlineByDefault: false
  });
});

function cacheEntries(cache) {
  return Object.values(cache?.entries || {});
}
