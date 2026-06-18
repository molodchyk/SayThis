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
