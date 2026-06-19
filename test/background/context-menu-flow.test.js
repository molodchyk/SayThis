import assert from "node:assert/strict";
import test from "node:test";
import {
  setTimeout as delay
} from "node:timers/promises";
import {
  handleContextMenuClick
} from "../../src/background/context-menu-flow.js";

function compactTraceCalls(calls) {
  return calls.map((call) => call.map(compactTraceValue));
}

function compactTraceValue(value) {
  if (Array.isArray(value)) {
    return value.map(compactTraceValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (value.id && value.source === "background" && value.action && value.startedAt) {
    return { action: value.action };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, innerValue]) => [key, compactTraceValue(innerValue)])
  );
}

test("ignores unknown context menu actions", async () => {
  const result = await handleContextMenuClick({ menuItemId: "unknown", selectionText: "Gnocchi" }, {}, {
    resolveOptionsForMenuId: () => ({ ok: false }),
    normalizeSelection: (value) => String(value || "").trim()
  });

  assert.deepEqual(result, { handled: false, reason: "unknown-menu" });
});

test("ignores context menu clicks without selected text", async () => {
  const result = await handleContextMenuClick({ menuItemId: "say", selectionText: "   " }, {}, {
    resolveOptionsForMenuId: () => ({ ok: true, source: "context-menu", options: {} }),
    normalizeSelection: (value) => String(value || "").trim()
  });

  assert.deepEqual(result, { handled: false, reason: "empty-selection" });
});

test("resolves, enriches, stores, and plays context menu selections", async () => {
  const calls = [];
  const resolved = { display: "Gnocchi", sourceStatus: "structured-source" };
  const enriched = {
    display: "Gnocchi",
    sourceStatus: "verified-audio",
    pronunciation: {
      audio: [{ url: "https://audio.example/gnocchi.ogg" }]
    }
  };
  const result = await handleContextMenuClick({ menuItemId: "say", selectionText: " Gnocchi " }, { id: 42 }, {
    resolveOptionsForMenuId: () => ({
      ok: true,
      source: "context-menu",
      options: { useOnline: false }
    }),
    normalizeSelection: (value) => String(value || "").trim(),
    setStorage: async (value) => calls.push(["setStorage", value]),
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return options.useOnline ? enriched : resolved;
    },
    playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
    lastResultKey: "lastResult"
  });

  assert.equal(result.handled, true);
  assert.equal(result.result, enriched);
  assert.deepEqual(compactTraceCalls(calls), [
    ["setStorage", { lastSelection: "Gnocchi", lastSource: "context-menu" }],
    ["resolveSelection", "Gnocchi", { useOnline: false, trace: { action: "context-menu" } }],
    ["resolveSelection", "Gnocchi", {
      useOnline: true,
      localResult: resolved,
      trace: { action: "context-menu" }
    }],
    ["setStorage", { lastResult: enriched }],
    ["playResolvedResult", enriched, 42]
  ]);
});

test("online context menu plays shared audio before refreshing the result", async () => {
  const calls = [];
  const local = { display: "Exampletown", sourceStatus: "structured-source" };
  const shared = {
    display: "Exampletown",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{ url: "https://audio.example/shared.mp3", quality: "generated" }]
    }
  };
  const refreshed = { display: "Exampletown", sourceStatus: "structured-source" };

  const result = await handleContextMenuClick({ menuItemId: "say-online", selectionText: " Exampletown " }, { id: 42 }, {
    resolveOptionsForMenuId: () => ({
      ok: true,
      source: "context-menu-online",
      options: { useOnline: true }
    }),
    normalizeSelection: (value) => String(value || "").trim(),
    setStorage: async (value) => calls.push(["setStorage", value]),
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return options.useOnline ? refreshed : local;
    },
    requestSharedAudio: async (text, value) => {
      calls.push(["requestSharedAudio", text, value]);
      return value === local ? shared : value;
    },
    playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
    showResultOnTab: async (tabId, value) => calls.push(["showResultOnTab", tabId, value]),
    lastResultKey: "lastResult"
  });

  assert.equal(result.handled, true);
  assert.equal(result.result, refreshed);
  assert.deepEqual(compactTraceCalls(calls), [
    ["setStorage", { lastSelection: "Exampletown", lastSource: "context-menu-online" }],
    ["requestSharedAudio", "Exampletown", null],
    ["resolveSelection", "Exampletown", {
      useOnline: false,
      trace: { action: "context-menu-online" }
    }],
    ["requestSharedAudio", "Exampletown", local],
    ["setStorage", { lastResult: shared }],
    ["playResolvedResult", shared, 42],
    ["resolveSelection", "Exampletown", {
      useOnline: true,
      localResult: local,
      trace: { action: "context-menu-online" }
    }],
    ["requestSharedAudio", "Exampletown", refreshed],
    ["setStorage", { lastResult: refreshed }],
    ["showResultOnTab", 42, refreshed]
  ]);
});

test("context menu plays direct approved shared audio before slow local resolution", async () => {
  const calls = [];
  const direct = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Direct shared audio",
        url: "https://audio.example/direct.mp3",
        quality: "generated"
      }]
    }
  };
  let resolveStarted = false;
  let finishResolve;
  const slowResolved = new Promise((resolve) => {
    finishResolve = () => resolve({ display: "Late result" });
  });

  const result = await handleContextMenuClick({ menuItemId: "say", selectionText: " Exampletown " }, { id: 42 }, {
    resolveOptionsForMenuId: () => ({
      ok: true,
      source: "context-menu",
      options: { useOnline: false }
    }),
    normalizeSelection: (value) => String(value || "").trim(),
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return {};
    },
    setStorage: async (value) => calls.push(["setStorage", value]),
    requestSharedAudio: async (text, value, options) => {
      calls.push(["requestSharedAudio", text, value, options]);
      return value ? value : direct;
    },
    resolveSelection: async (text, options) => {
      resolveStarted = true;
      calls.push(["resolveSelection", text, options]);
      return slowResolved;
    },
    playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
    directSharedAudioWaitMs: 25,
    lastResultKey: "lastResult"
  });

  assert.equal(result.handled, true);
  assert.equal(result.result, direct);
  assert.equal(resolveStarted, true);
  assert.deepEqual(compactTraceCalls(calls.slice(0, 6)), [
    ["setStorage", { lastSelection: "Exampletown", lastSource: "context-menu" }],
    ["getStorage", ["lastResult"]],
    ["requestSharedAudio", "Exampletown", null, {
      trace: { action: "context-menu" },
      directLookup: true,
      skipRefresh: true
    }],
    ["resolveSelection", "Exampletown", {
      useOnline: false,
      trace: { action: "context-menu" }
    }],
    ["setStorage", { lastResult: direct }],
    ["playResolvedResult", direct, 42]
  ]);

  finishResolve();
  await delay(0);
});

test("online context menu reuses matching stored audio before local fallback can resolve it", async () => {
  const calls = [];
  const stored = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{ url: "https://audio.example/stored.mp3", quality: "generated" }]
    }
  };
  const refreshed = { display: "Exampletown", sourceStatus: "structured-source" };

  const result = await handleContextMenuClick({ menuItemId: "say-online", selectionText: " Exampletown " }, { id: 42 }, {
    resolveOptionsForMenuId: () => ({
      ok: true,
      source: "context-menu-online",
      options: { useOnline: true }
    }),
    normalizeSelection: (value) => String(value || "").trim(),
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return { lastResult: stored };
    },
    setStorage: async (value) => calls.push(["setStorage", value]),
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return refreshed;
    },
    requestSharedAudio: async (text, value) => {
      calls.push(["requestSharedAudio", text, value]);
      return value;
    },
    playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
    showResultOnTab: async (tabId, value) => calls.push(["showResultOnTab", tabId, value]),
    lastResultKey: "lastResult"
  });

  assert.equal(result.handled, true);
  assert.equal(result.result, refreshed);
  assert.deepEqual(compactTraceCalls(calls), [
    ["setStorage", { lastSelection: "Exampletown", lastSource: "context-menu-online" }],
    ["getStorage", ["lastResult"]],
    ["setStorage", { lastResult: stored }],
    ["playResolvedResult", stored, 42],
    ["resolveSelection", "Exampletown", {
      useOnline: true,
      localResult: stored,
      trace: { action: "context-menu-online" }
    }],
    ["requestSharedAudio", "Exampletown", refreshed],
    ["setStorage", { lastResult: refreshed }],
    ["showResultOnTab", 42, refreshed]
  ]);
});

test("plain context menu reuses matching stored audio without online enrichment", async () => {
  const calls = [];
  const stored = {
    query: "Exampletown",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{ url: "https://audio.example/stored.mp3", quality: "generated" }]
    }
  };

  const result = await handleContextMenuClick({ menuItemId: "say", selectionText: "Exampletown" }, { id: 42 }, {
    resolveOptionsForMenuId: () => ({
      ok: true,
      source: "context-menu",
      options: { useOnline: false }
    }),
    normalizeSelection: (value) => String(value || "").trim(),
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return { lastResult: stored };
    },
    setStorage: async (value) => calls.push(["setStorage", value]),
    resolveSelection: async () => {
      throw new Error("should not resolve when stored audio matches");
    },
    playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
    lastResultKey: "lastResult"
  });

  assert.equal(result.handled, true);
  assert.equal(result.result, stored);
  assert.equal(result.reusedStored, true);
  assert.deepEqual(calls, [
    ["setStorage", { lastSelection: "Exampletown", lastSource: "context-menu" }],
    ["getStorage", ["lastResult"]],
    ["setStorage", { lastResult: stored }],
    ["playResolvedResult", stored, 42]
  ]);
});

test("does not guess with raw speech when context menu resolution fails", async () => {
  const calls = [];
  const result = await handleContextMenuClick({ menuItemId: "say", selectionText: "Gnocchi" }, {}, {
    resolveOptionsForMenuId: () => ({ ok: true, source: "context-menu", options: {} }),
    normalizeSelection: (value) => String(value || "").trim(),
    setStorage: async () => {},
    resolveSelection: async () => {
      throw new Error("offline");
    }
  });

  assert.equal(result.handled, false);
  assert.equal(result.reason, "resolve-failed");
  assert.equal(result.error.message, "offline");
  assert.deepEqual(calls, []);
});
