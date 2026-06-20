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

test("context menu reuses visible overlay audio without lookup", async () => {
  const calls = [];
  const visible = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Visible shared audio",
        url: "https://audio.example/visible.mp3",
        quality: "generated"
      }]
    }
  };

  const result = await handleContextMenuClick({ menuItemId: "say", selectionText: " Exampletown " }, { id: 42 }, {
    resolveOptionsForMenuId: () => ({
      ok: true,
      source: "context-menu",
      options: { useOnline: false }
    }),
    normalizeSelection: (value) => String(value || "").trim(),
    getVisibleResultOnTab: async (tabId) => {
      calls.push(["getVisibleResultOnTab", tabId]);
      return visible;
    },
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return {};
    },
    requestSharedAudio: async () => {
      throw new Error("should not request shared audio when visible audio matches");
    },
    resolveSelection: async () => {
      throw new Error("should not resolve when visible audio matches");
    },
    setStorage: async (value) => calls.push(["setStorage", value]),
    playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
    lastResultKey: "lastResult"
  });

  assert.equal(result.handled, true);
  assert.equal(result.result, visible);
  assert.equal(result.reusedStored, true);
  assert.deepEqual(calls, [
    ["setStorage", { lastSelection: "Exampletown", lastSource: "context-menu" }],
    ["getVisibleResultOnTab", 42],
    ["getStorage", ["lastResult"]],
    ["setStorage", { lastResult: visible }],
    ["playResolvedResult", visible, 42]
  ]);
});

test("context menu does not wait for a slow visible result before direct shared audio", async () => {
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

  const result = await handleContextMenuClick({ menuItemId: "say", selectionText: " Exampletown " }, { id: 42 }, {
    resolveOptionsForMenuId: () => ({
      ok: true,
      source: "context-menu",
      options: { useOnline: false }
    }),
    normalizeSelection: (value) => String(value || "").trim(),
    getVisibleResultOnTab: async (tabId) => {
      calls.push(["getVisibleResultOnTab", tabId]);
      return new Promise(() => {});
    },
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return {};
    },
    requestSharedAudio: async (text, value, options) => {
      calls.push(["requestSharedAudio", text, value, options]);
      return value ? value : direct;
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return new Promise(() => {});
    },
    setStorage: async (value) => calls.push(["setStorage", value]),
    playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
    visibleResultGraceMs: 5,
    storedResultGraceMs: 5,
    directSharedAudioWaitMs: 50,
    lastResultKey: "lastResult"
  });

  assert.equal(result.handled, true);
  assert.equal(result.result, direct);
  assert.deepEqual(compactTraceCalls(calls), [
    ["setStorage", { lastSelection: "Exampletown", lastSource: "context-menu" }],
    ["getVisibleResultOnTab", 42],
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

test("context menu still plays shared audio after the fast wait window", async () => {
  const calls = [];
  const direct = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Delayed shared audio",
        url: "https://audio.example/delayed.mp3",
        quality: "generated"
      }]
    }
  };

  const result = await Promise.race([
    handleContextMenuClick({ menuItemId: "say", selectionText: " Exampletown " }, { id: 42 }, {
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
        await delay(75);
        return value ? value : direct;
      },
      resolveSelection: async (text, options) => {
        calls.push(["resolveSelection", text, options]);
        await delay(500);
        return { display: "Late result" };
      },
      playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
      directSharedAudioWaitMs: 5,
      directSharedAudioFallbackWaitMs: 150,
      lastResultKey: "lastResult"
    }),
    delay(250).then(() => "timeout")
  ]);

  assert.notEqual(result, "timeout");
  assert.equal(result.handled, true);
  assert.equal(result.result, direct);
  assert.equal(calls.some((call) => call[0] === "playResolvedResult" && call[1] === direct), true);
});

test("plain context menu only checks local shared audio after local resolution", async () => {
  const calls = [];
  const resolved = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    sourceStatus: "structured-source"
  };

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
    requestSharedAudio: async (text, value, options) => {
      calls.push(["requestSharedAudio", text, value, options]);
      return null;
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return resolved;
    },
    setStorage: async (value) => calls.push(["setStorage", value]),
    playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
    visibleResultGraceMs: 5,
    storedResultGraceMs: 5,
    directSharedAudioWaitMs: 25,
    lastResultKey: "lastResult"
  });

  assert.equal(result.handled, true);
  assert.equal(result.result, resolved);
  assert.deepEqual(compactTraceCalls(calls), [
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
    ["requestSharedAudio", "Exampletown", resolved, {
      useOnline: false,
      trace: { action: "context-menu" },
      sharedAudioLocalOnly: true
    }],
    ["setStorage", { lastResult: resolved }],
    ["playResolvedResult", resolved, 42]
  ]);
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

test("context menu plays prepared shared audio without waiting for visible or stored probes", async () => {
  clearPreparedSharedAudioForTests();
  const calls = [];
  const direct = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Prepared shared audio",
        url: "https://audio.example/prepared-fast.mp3",
        quality: "generated"
      }]
    }
  };
  const selectionTrace = {
    id: "selection-preload-fast-context",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };
  let finishDirect;
  const directPromise = new Promise((resolve) => {
    finishDirect = () => resolve(direct);
  });
  const dependencies = {
    resolveOptionsForMenuId: () => ({
      ok: true,
      source: "context-menu",
      options: { useOnline: false }
    }),
    normalizeSelection: (value) => String(value || "").trim(),
    getVisibleResultOnTab: async (tabId) => {
      calls.push(["getVisibleResultOnTab", tabId]);
      return new Promise(() => {});
    },
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      await delay(100);
      return {};
    },
    setStorage: async (value) => calls.push(["setStorage", value]),
    requestSharedAudio: async (text, value, options) => {
      calls.push(["requestSharedAudio", text, value, options]);
      return directPromise;
    },
    resolveSelection: async () => {
      throw new Error("should not resolve before prepared shared audio plays");
    },
    playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
    visibleResultGraceMs: 100,
    storedResultGraceMs: 100,
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
  setTimeout(finishDirect, 10);

  const result = await Promise.race([
    resultPromise,
    delay(60).then(() => "timeout")
  ]);

  assert.notEqual(result, "timeout");
  assert.equal(result.handled, true);
  assert.equal(result.result, direct);
  assert.equal(calls.some((call) => call[0] === "playResolvedResult" && call[1] === direct), true);

  await delay(0);
  clearPreparedSharedAudioForTests();
});

test("context menu does not wait on a stuck prepared shared-audio request", async () => {
  clearPreparedSharedAudioForTests();
  const calls = [];
  const localPlayable = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    sourceStatus: "structured-source",
    pronunciation: {
      audio: [{
        label: "Local playable audio",
        url: "https://audio.example/local.mp3",
        quality: "source-backed"
      }]
    }
  };
  const selectionTrace = {
    id: "selection-stuck-context",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };
  let requestCount = 0;
  let finishResolve;
  const slowResolved = new Promise((resolve) => {
    finishResolve = () => resolve(localPlayable);
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
      requestCount += 1;
      calls.push(["requestSharedAudio", text, value, options]);
      return new Promise(() => {});
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return slowResolved;
    },
    playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
    preparedSharedAudioWaitMs: 5,
    directSharedAudioWaitMs: 80,
    lastResultKey: "lastResult"
  };

  prepareSharedAudio("Exampletown", {
    rate: 0.82,
    trace: selectionTrace
  }, dependencies);
  setTimeout(finishResolve, 10);
  const result = await handleContextMenuClick(
    { menuItemId: "say", selectionText: " Exampletown " },
    { id: 42 },
    dependencies
  );

  assert.equal(result.handled, true);
  assert.equal(result.result, localPlayable);
  assert.equal(requestCount, 1);
  assert.equal(calls.some((call) => call[0] === "playResolvedResult" && call[1] === localPlayable), true);

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
