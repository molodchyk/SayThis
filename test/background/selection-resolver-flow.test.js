import assert from "node:assert/strict";
import test from "node:test";
import {
  createRemoteStructuredResult
} from "../../src/resolver-core.js";
import {
  upsertCachedResult
} from "../../src/result-cache.js";
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
