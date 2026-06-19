import assert from "node:assert/strict";
import test from "node:test";
import {
  setTimeout as delay
} from "node:timers/promises";
import {
  handleContextMenuClick
} from "../../src/background/context-menu-flow.js";
import {
  clearPreparedSharedAudioForTests,
  prepareSharedAudio
} from "../../src/background/prepared-shared-audio-flow.js";

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

test("resolves, stores, and plays immediate context menu selections", async () => {
  const calls = [];
  const resolved = { display: "Gnocchi", sourceStatus: "structured-source" };
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
      return resolved;
    },
    playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
    lastResultKey: "lastResult"
  });

  assert.equal(result.handled, true);
  assert.equal(result.result, resolved);
  assert.deepEqual(compactTraceCalls(calls), [
    ["setStorage", { lastSelection: "Gnocchi", lastSource: "context-menu" }],
    ["resolveSelection", "Gnocchi", { useOnline: false, trace: { action: "context-menu" } }],
    ["setStorage", { lastResult: resolved }],
    ["playResolvedResult", resolved, 42]
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

test("context menu reuses shared audio prepared from selection", async () => {
  clearPreparedSharedAudioForTests();
  const calls = [];
  const direct = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Prepared shared audio",
        url: "https://audio.example/prepared.mp3",
        quality: "generated"
      }]
    }
  };
  const selectionTrace = {
    id: "selection-preload-context",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };
  let finishDirect;
  let finishResolve;
  const directPromise = new Promise((resolve) => {
    finishDirect = () => resolve(direct);
  });
  const slowResolved = new Promise((resolve) => {
    finishResolve = () => resolve({ display: "Late result" });
  });
  const dependencies = {
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
      return directPromise;
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return slowResolved;
    },
    playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
    directSharedAudioWaitMs: 200,
    preparedSharedAudioTtlMs: 1000,
    lastResultKey: "lastResult"
  };

  prepareSharedAudio("Exampletown", {
    rate: 0.82,
    trace: selectionTrace
  }, dependencies);
  const resultPromise = handleContextMenuClick(
    { menuItemId: "say", selectionText: " Exampletown " },
    { id: 42 },
    dependencies
  );

  finishDirect();
  const result = await resultPromise;

  assert.equal(result.handled, true);
  assert.equal(result.result, direct);
  assert.equal(calls.filter((call) => call[0] === "requestSharedAudio").length, 1);
  assert.deepEqual(compactTraceCalls(calls.slice(0, 6)), [
    ["requestSharedAudio", "Exampletown", null, {
      rate: 0.82,
      trace: selectionTrace,
      directLookup: true,
      skipRefresh: true
    }],
    ["setStorage", { lastSelection: "Exampletown", lastSource: "context-menu" }],
    ["getStorage", ["lastResult"]],
    ["resolveSelection", "Exampletown", {
      useOnline: false,
      trace: { action: "context-menu" }
    }],
    ["setStorage", { lastResult: direct }],
    ["playResolvedResult", direct, 42]
  ]);

  finishResolve();
  await delay(0);
  clearPreparedSharedAudioForTests();
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

test("context menu playback does not wait for selection bookkeeping", async () => {
  const calls = [];
  const stored = {
    query: "Exampletown",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{ url: "https://audio.example/stored.mp3", quality: "generated" }]
    }
  };

  const result = await Promise.race([
    handleContextMenuClick({ menuItemId: "say", selectionText: "Exampletown" }, { id: 42 }, {
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
      setStorage: (value) => {
        calls.push(["setStorage", value]);
        return new Promise(() => {});
      },
      resolveSelection: async () => {
        throw new Error("should not resolve when stored audio matches");
      },
      playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
      lastResultKey: "lastResult"
    }),
    delay(25).then(() => "timeout")
  ]);

  assert.notEqual(result, "timeout");
  assert.equal(result.handled, true);
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
