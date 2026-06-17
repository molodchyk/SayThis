import assert from "node:assert/strict";
import test from "node:test";
import {
  handleActiveSelectionCommand
} from "../../src/background/active-selection-flow.js";

test("ignores keyboard commands without an active tab", async () => {
  const result = await handleActiveSelectionCommand({ source: "keyboard" }, {
    getActiveTab: async () => null
  });

  assert.deepEqual(result, { handled: false, reason: "no-active-tab" });
});

test("ignores keyboard commands without selected text", async () => {
  const result = await handleActiveSelectionCommand({ source: "keyboard" }, {
    getActiveTab: async () => ({ id: 7 }),
    readSelectionFromTab: async () => ""
  });

  assert.deepEqual(result, { handled: false, reason: "empty-selection" });
});

test("resolves, stores, and plays keyboard selections", async () => {
  const calls = [];
  const resolved = { display: "Gnocchi", sourceStatus: "structured-source" };
  const result = await handleActiveSelectionCommand({
    source: "keyboard-online",
    useOnline: true
  }, {
    getActiveTab: async () => ({ id: 7 }),
    readSelectionFromTab: async (tabId) => {
      calls.push(["readSelectionFromTab", tabId]);
      return "Gnocchi";
    },
    setStorage: async (value) => calls.push(["setStorage", value]),
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return resolved;
    },
    playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
    lastSelectionKey: "lastSelection",
    lastSourceKey: "lastSource"
  });

  assert.equal(result.handled, true);
  assert.equal(result.result, resolved);
  assert.deepEqual(calls, [
    ["readSelectionFromTab", 7],
    ["setStorage", { lastSelection: "Gnocchi", lastSource: "keyboard-online" }],
    ["resolveSelection", "Gnocchi", { useOnline: true }],
    ["playResolvedResult", resolved, 7]
  ]);
});

test("falls back to speech when keyboard resolution fails", async () => {
  const calls = [];
  const result = await handleActiveSelectionCommand({ source: "keyboard" }, {
    getActiveTab: async () => ({ id: 7 }),
    readSelectionFromTab: async () => "Gnocchi",
    setStorage: async () => {},
    resolveSelection: async () => {
      throw new Error("offline");
    },
    speakFallback: (text) => calls.push(["speakFallback", text])
  });

  assert.equal(result.handled, false);
  assert.equal(result.reason, "resolve-failed");
  assert.equal(result.error.message, "offline");
  assert.deepEqual(calls, [["speakFallback", "Gnocchi"]]);
});
