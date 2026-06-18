import assert from "node:assert/strict";
import test from "node:test";
import {
  activeSelectionOptionsForCommand,
  handleActiveSelectionCommandName,
  handleActiveSelectionCommand
} from "../../src/background/active-selection-flow.js";

test("maps keyboard command names to active-selection options", () => {
  assert.deepEqual(activeSelectionOptionsForCommand("pronounce-selection"), {
    source: "keyboard"
  });
  assert.deepEqual(activeSelectionOptionsForCommand("pronounce-selection-online"), {
    source: "keyboard-online",
    useOnline: true
  });
  assert.equal(activeSelectionOptionsForCommand("unknown"), null);
});

test("ignores unknown keyboard command names", async () => {
  const result = await handleActiveSelectionCommandName("unknown", {
    getActiveTab: async () => {
      throw new Error("should not inspect tabs");
    }
  });

  assert.deepEqual(result, { handled: false, reason: "unknown-command" });
});

test("routes online keyboard command names through active-selection handling", async () => {
  const calls = [];
  const resolved = { display: "Gnocchi", sourceStatus: "structured-source" };
  const result = await handleActiveSelectionCommandName("pronounce-selection-online", {
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
  assert.deepEqual(calls, [
    ["readSelectionFromTab", 7],
    ["setStorage", { lastSelection: "Gnocchi", lastSource: "keyboard-online" }],
    ["resolveSelection", "Gnocchi", { useOnline: true }],
    ["playResolvedResult", resolved, 7]
  ]);
});

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

test("enriches no-audio keyboard selections before playback", async () => {
  const calls = [];
  const resolved = { display: "Gnocchi", sourceStatus: "structured-source" };
  const enriched = {
    display: "Gnocchi",
    sourceStatus: "verified-audio",
    pronunciation: {
      audio: [{ url: "https://audio.example/gnocchi.ogg" }]
    }
  };
  const result = await handleActiveSelectionCommand({
    source: "keyboard"
  }, {
    getActiveTab: async () => ({ id: 7 }),
    readSelectionFromTab: async (tabId) => {
      calls.push(["readSelectionFromTab", tabId]);
      return "Gnocchi";
    },
    setStorage: async (value) => calls.push(["setStorage", value]),
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return options.useOnline ? enriched : resolved;
    },
    playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
    lastSelectionKey: "lastSelection",
    lastSourceKey: "lastSource"
  });

  assert.equal(result.handled, true);
  assert.equal(result.result, enriched);
  assert.deepEqual(calls, [
    ["readSelectionFromTab", 7],
    ["setStorage", { lastSelection: "Gnocchi", lastSource: "keyboard" }],
    ["resolveSelection", "Gnocchi", { useOnline: undefined }],
    ["resolveSelection", "Gnocchi", { useOnline: true, localResult: resolved }],
    ["playResolvedResult", enriched, 7]
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
