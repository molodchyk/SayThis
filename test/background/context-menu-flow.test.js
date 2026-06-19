import assert from "node:assert/strict";
import test from "node:test";
import {
  handleContextMenuClick
} from "../../src/background/context-menu-flow.js";

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
  assert.deepEqual(calls, [
    ["setStorage", { lastSelection: "Gnocchi", lastSource: "context-menu" }],
    ["resolveSelection", "Gnocchi", { useOnline: false }],
    ["resolveSelection", "Gnocchi", { useOnline: true, localResult: resolved }],
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
  assert.deepEqual(calls, [
    ["setStorage", { lastSelection: "Exampletown", lastSource: "context-menu-online" }],
    ["resolveSelection", "Exampletown", { useOnline: false }],
    ["requestSharedAudio", "Exampletown", local],
    ["setStorage", { lastResult: shared }],
    ["playResolvedResult", shared, 42],
    ["resolveSelection", "Exampletown", { useOnline: true, localResult: local }],
    ["requestSharedAudio", "Exampletown", refreshed],
    ["setStorage", { lastResult: refreshed }],
    ["showResultOnTab", 42, refreshed]
  ]);
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
  assert.deepEqual(calls, [
    ["setStorage", { lastSelection: "Exampletown", lastSource: "context-menu-online" }],
    ["getStorage", ["lastResult"]],
    ["setStorage", { lastResult: stored }],
    ["playResolvedResult", stored, 42],
    ["resolveSelection", "Exampletown", { useOnline: true, localResult: stored }],
    ["requestSharedAudio", "Exampletown", refreshed],
    ["setStorage", { lastResult: refreshed }],
    ["showResultOnTab", 42, refreshed]
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
