import assert from "node:assert/strict";
import test from "node:test";
import {
  setTimeout as delay
} from "node:timers/promises";
import {
  activeSelectionOptionsForCommand,
  handleActiveSelectionCommandName,
  handleActiveSelectionCommand
} from "../../src/background/active-selection-flow.js";

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
  assert.deepEqual(compactTraceCalls(calls), [
    ["readSelectionFromTab", 7],
    ["setStorage", { lastSelection: "Gnocchi", lastSource: "keyboard-online" }],
    ["resolveSelection", "Gnocchi", {
      source: "keyboard-online",
      useOnline: false,
      trace: { action: "keyboard-online" }
    }],
    ["resolveSelection", "Gnocchi", {
      source: "keyboard-online",
      useOnline: true,
      localResult: resolved,
      trace: { action: "keyboard-online" }
    }],
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
  assert.deepEqual(compactTraceCalls(calls), [
    ["readSelectionFromTab", 7],
    ["setStorage", { lastSelection: "Gnocchi", lastSource: "keyboard-online" }],
    ["resolveSelection", "Gnocchi", {
      source: "keyboard-online",
      useOnline: false,
      trace: { action: "keyboard-online" }
    }],
    ["resolveSelection", "Gnocchi", {
      source: "keyboard-online",
      useOnline: true,
      localResult: resolved,
      trace: { action: "keyboard-online" }
    }],
    ["playResolvedResult", resolved, 7]
  ]);
});

test("online keyboard command plays shared audio before refreshing the result", async () => {
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

  const result = await handleActiveSelectionCommand({
    source: "keyboard-online",
    useOnline: true
  }, {
    getActiveTab: async () => ({ id: 7 }),
    readSelectionFromTab: async (tabId) => {
      calls.push(["readSelectionFromTab", tabId]);
      return "Exampletown";
    },
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
    lastSelectionKey: "lastSelection",
    lastSourceKey: "lastSource"
  });

  assert.equal(result.handled, true);
  assert.equal(result.result, refreshed);
  assert.deepEqual(compactTraceCalls(calls), [
    ["readSelectionFromTab", 7],
    ["setStorage", { lastSelection: "Exampletown", lastSource: "keyboard-online" }],
    ["requestSharedAudio", "Exampletown", null],
    ["resolveSelection", "Exampletown", {
      source: "keyboard-online",
      useOnline: false,
      trace: { action: "keyboard-online" }
    }],
    ["requestSharedAudio", "Exampletown", local],
    ["playResolvedResult", shared, 7],
    ["resolveSelection", "Exampletown", {
      source: "keyboard-online",
      useOnline: true,
      localResult: local,
      trace: { action: "keyboard-online" }
    }],
    ["requestSharedAudio", "Exampletown", refreshed],
    ["showResultOnTab", 7, refreshed]
  ]);
});

test("keyboard command plays direct approved shared audio before slow local resolution", async () => {
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

  const result = await handleActiveSelectionCommand({
    source: "keyboard"
  }, {
    getActiveTab: async () => ({ id: 7 }),
    readSelectionFromTab: async (tabId) => {
      calls.push(["readSelectionFromTab", tabId]);
      return "Exampletown";
    },
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
    lastSelectionKey: "lastSelection",
    lastSourceKey: "lastSource",
    lastResultKey: "lastResult"
  });

  assert.equal(result.handled, true);
  assert.equal(result.result, direct);
  assert.equal(resolveStarted, true);
  assert.deepEqual(compactTraceCalls(calls.slice(0, 6)), [
    ["readSelectionFromTab", 7],
    ["setStorage", { lastSelection: "Exampletown", lastSource: "keyboard" }],
    ["getStorage", ["lastResult"]],
    ["requestSharedAudio", "Exampletown", null, {
      trace: { action: "keyboard" },
      directLookup: true,
      skipRefresh: true
    }],
    ["resolveSelection", "Exampletown", {
      source: "keyboard",
      useOnline: false,
      trace: { action: "keyboard" }
    }],
    ["playResolvedResult", direct, 7]
  ]);

  finishResolve();
  await delay(0);
});

test("online keyboard command reuses matching stored audio before local fallback can resolve it", async () => {
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

  const result = await handleActiveSelectionCommand({
    source: "keyboard-online",
    useOnline: true
  }, {
    getActiveTab: async () => ({ id: 7 }),
    readSelectionFromTab: async (tabId) => {
      calls.push(["readSelectionFromTab", tabId]);
      return "Exampletown";
    },
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
    lastSelectionKey: "lastSelection",
    lastSourceKey: "lastSource",
    lastResultKey: "lastResult"
  });

  assert.equal(result.handled, true);
  assert.equal(result.result, refreshed);
  assert.deepEqual(compactTraceCalls(calls), [
    ["readSelectionFromTab", 7],
    ["setStorage", { lastSelection: "Exampletown", lastSource: "keyboard-online" }],
    ["getStorage", ["lastResult"]],
    ["playResolvedResult", stored, 7],
    ["resolveSelection", "Exampletown", {
      source: "keyboard-online",
      useOnline: true,
      localResult: stored,
      trace: { action: "keyboard-online" }
    }],
    ["requestSharedAudio", "Exampletown", refreshed],
    ["showResultOnTab", 7, refreshed]
  ]);
});

test("plain keyboard command reuses matching stored audio without online enrichment", async () => {
  const calls = [];
  const stored = {
    query: "Exampletown",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{ url: "https://audio.example/stored.mp3", quality: "generated" }]
    }
  };

  const result = await handleActiveSelectionCommand({
    source: "keyboard"
  }, {
    getActiveTab: async () => ({ id: 7 }),
    readSelectionFromTab: async (tabId) => {
      calls.push(["readSelectionFromTab", tabId]);
      return "Exampletown";
    },
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return { lastResult: stored };
    },
    setStorage: async (value) => calls.push(["setStorage", value]),
    resolveSelection: async () => {
      throw new Error("should not resolve when stored audio matches");
    },
    playResolvedResult: async (value, tabId) => calls.push(["playResolvedResult", value, tabId]),
    lastSelectionKey: "lastSelection",
    lastSourceKey: "lastSource",
    lastResultKey: "lastResult"
  });

  assert.equal(result.handled, true);
  assert.equal(result.result, stored);
  assert.equal(result.reusedStored, true);
  assert.deepEqual(calls, [
    ["readSelectionFromTab", 7],
    ["setStorage", { lastSelection: "Exampletown", lastSource: "keyboard" }],
    ["getStorage", ["lastResult"]],
    ["playResolvedResult", stored, 7]
  ]);
});

test("keyboard playback does not wait for selection bookkeeping", async () => {
  const calls = [];
  const stored = {
    query: "Exampletown",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{ url: "https://audio.example/stored.mp3", quality: "generated" }]
    }
  };

  const result = await Promise.race([
    handleActiveSelectionCommand({
      source: "keyboard"
    }, {
      getActiveTab: async () => ({ id: 7 }),
      readSelectionFromTab: async (tabId) => {
        calls.push(["readSelectionFromTab", tabId]);
        return "Exampletown";
      },
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
      lastSelectionKey: "lastSelection",
      lastSourceKey: "lastSource",
      lastResultKey: "lastResult"
    }),
    delay(25).then(() => "timeout")
  ]);

  assert.notEqual(result, "timeout");
  assert.equal(result.handled, true);
  assert.deepEqual(calls, [
    ["readSelectionFromTab", 7],
    ["setStorage", { lastSelection: "Exampletown", lastSource: "keyboard" }],
    ["getStorage", ["lastResult"]],
    ["playResolvedResult", stored, 7]
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
  assert.deepEqual(compactTraceCalls(calls), [
    ["readSelectionFromTab", 7],
    ["setStorage", { lastSelection: "Gnocchi", lastSource: "keyboard" }],
    ["resolveSelection", "Gnocchi", {
      source: "keyboard",
      useOnline: false,
      trace: { action: "keyboard" }
    }],
    ["resolveSelection", "Gnocchi", {
      source: "keyboard",
      useOnline: true,
      localResult: resolved,
      trace: { action: "keyboard" }
    }],
    ["playResolvedResult", enriched, 7]
  ]);
});

test("does not guess with raw speech when keyboard resolution fails", async () => {
  const calls = [];
  const result = await handleActiveSelectionCommand({ source: "keyboard" }, {
    getActiveTab: async () => ({ id: 7 }),
    readSelectionFromTab: async () => "Gnocchi",
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
