import assert from "node:assert/strict";
import test from "node:test";
import {
  setTimeout as delay
} from "node:timers/promises";
import {
  MESSAGE_TYPES
} from "../../src/message-contracts.js";
import {
  handleRuntimeMessage,
  useOnlineMessageOptions
} from "../../src/background/runtime-message-flow.js";

test("normalizes online options from runtime messages", () => {
  assert.deepEqual(useOnlineMessageOptions({ languageHints: "pl, tr, bad!" }), {
    languageHints: ["pl", "tr"]
  });
  assert.deepEqual(useOnlineMessageOptions({ useOnline: false, languageHints: ["ja", "en"] }), {
    useOnline: false,
    languageHints: ["ja", "en"]
  });
  assert.deepEqual(useOnlineMessageOptions({}), {});
  assert.deepEqual(useOnlineMessageOptions({ skipSharedAudio: true }), {
    skipSharedAudio: true
  });
});

test("ignores unknown runtime messages", () => {
  const responses = [];
  const handled = handleRuntimeMessage({ type: "UNKNOWN" }, (value) => responses.push(value), {});

  assert.equal(handled, false);
  assert.deepEqual(responses, []);
});

test("resolves selected text runtime messages", async () => {
  const responses = [];
  const calls = [];
  const resolved = { display: "Gnocchi" };
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.resolve,
    text: "Gnocchi",
    useOnline: true,
    languageHints: "it"
  }, (value) => responses.push(value), {
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return resolved;
    }
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(calls, [["resolveSelection", "Gnocchi", { useOnline: true, languageHints: ["it"] }]]);
  assert.deepEqual(responses, [{ ok: true, result: resolved }]);
});

test("speaks supplied runtime results when refresh is unavailable", async () => {
  const responses = [];
  const calls = [];
  const resolved = { display: "Gnocchi" };
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Gnocchi",
    result: resolved,
    rate: 0.7,
    lang: "it"
  }, (value) => responses.push(value), {
    resolveSelection: async () => {
      throw new Error("should not resolve");
    },
    speakResult: (result, options) => calls.push(["speakResult", result, options])
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(calls, [["speakResult", resolved, { rate: 0.7, lang: "it" }]]);
  assert.deepEqual(responses, [{ ok: true, result: resolved }]);
});

test("plays refreshed runtime audio before speech fallback", async () => {
  const responses = [];
  const calls = [];
  const supplied = {
    display: "Exampletown",
    sourceForm: "Exampletown",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
  const refreshed = {
    ...supplied,
    sourceForm: "Przykladowo",
    pronunciation: {
      audio: [{
        url: "https://example.com/przykladowo.ogg",
        quality: "verified"
      }]
    }
  };
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    result: supplied,
    rate: 0.82
  }, (value) => responses.push(value), {
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return refreshed;
    },
    playAudio: async (audio, rate) => {
      calls.push(["playAudio", audio, rate]);
      return true;
    },
    speakResult: async () => {
      throw new Error("should not speak when refreshed audio plays");
    }
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(calls, [
    ["resolveSelection", "Exampletown", { useOnline: true, localResult: supplied }],
    ["playAudio", refreshed.pronunciation.audio[0], 0.82]
  ]);
  assert.deepEqual(responses, [{
    ok: true,
    result: refreshed,
    speech: {
      fallback: "audio",
      text: "Pronunciation audio"
    }
  }]);
});

test("plays shared audio for runtime speak results before speech fallback", async () => {
  const responses = [];
  const calls = [];
  const supplied = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
  const shared = {
    ...supplied,
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        url: "https://community.example/audio/aud_1234567890abcdef",
        quality: "generated"
      }]
    }
  };
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    result: supplied,
    rate: 0.62
  }, (value) => responses.push(value), {
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return supplied;
    },
    requestSharedAudio: async (text, result, options) => {
      calls.push(["requestSharedAudio", text, result, options]);
      return shared;
    },
    playAudio: async (audio, rate) => {
      calls.push(["playAudio", audio, rate]);
      return true;
    },
    speakResult: async () => {
      throw new Error("should not speak when shared audio plays");
    }
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(calls, [
    ["resolveSelection", "Exampletown", { useOnline: true, localResult: supplied }],
    ["requestSharedAudio", "Exampletown", supplied, {}],
    ["playAudio", shared.pronunciation.audio[0], 0.62]
  ]);
  assert.deepEqual(responses, [{
    ok: true,
    result: shared,
    speech: {
      fallback: "audio",
      text: "Pronunciation audio"
    }
  }]);
});

test("runtime speak reuses matching stored audio without resolving", async () => {
  const responses = [];
  const calls = [];
  const stored = {
    query: "Exampletown",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Stored shared audio",
        url: "https://community.example/audio/aud_1234567890abcdef",
        quality: "generated"
      }]
    }
  };
  const trace = {
    id: "trace-stored",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };

  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    rate: 0.82,
    trace
  }, (value) => responses.push(value), {
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return { lastResult: stored };
    },
    resolveSelection: async () => {
      throw new Error("should not resolve when stored audio matches");
    },
    requestSharedAudio: async () => {
      throw new Error("should not request shared audio when stored audio matches");
    },
    playAudio: async (audio, rate, messageTrace) => {
      calls.push(["playAudio", audio, rate, messageTrace]);
      return true;
    },
    speakResult: async () => {
      throw new Error("should not speak when stored audio plays");
    },
    recordDebugEvent: (kind, payload) => calls.push(["recordDebugEvent", kind, payload]),
    lastResultKey: "lastResult"
  });

  await delay(0);

  assert.equal(handled, true);
  assert.equal(responses[0].ok, true);
  assert.equal(responses[0].result, stored);
  assert.deepEqual(responses[0].speech, {
    fallback: "audio",
    text: "Stored shared audio"
  });
  assert.deepEqual(calls, [
    ["recordDebugEvent", "ui:selection-auto-speak", {
      text: "Exampletown",
      trace
    }],
    ["getStorage", ["lastResult"]],
    ["recordDebugEvent", "stored-result:hit", {
      text: "Exampletown",
      sourceStatus: "generated-audio",
      audioQuality: "generated",
      trace
    }],
    ["playAudio", stored.pronunciation.audio[0], 0.82, trace]
  ]);
});

test("runtime speak plays direct approved shared audio before slow resolution", async () => {
  const responses = [];
  const calls = [];
  const direct = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Direct shared audio",
        url: "https://community.example/audio/aud_1234567890abcdef",
        quality: "generated"
      }]
    }
  };
  const trace = {
    id: "trace-direct",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };
  let resolveStarted = false;
  let finishResolve;
  const slowResolved = new Promise((resolve) => {
    finishResolve = () => resolve({ display: "Late result" });
  });

  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    rate: 0.82,
    trace
  }, (value) => responses.push(value), {
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return {};
    },
    requestSharedAudio: async (text, result, options) => {
      calls.push(["requestSharedAudio", text, result, options]);
      return direct;
    },
    resolveSelection: async (text, options) => {
      resolveStarted = true;
      calls.push(["resolveSelection", text, options]);
      return slowResolved;
    },
    playAudio: async (audio, rate, messageTrace) => {
      calls.push(["playAudio", audio, rate, messageTrace]);
      return true;
    },
    speakResult: async () => {
      throw new Error("should not speak when direct shared audio plays");
    },
    directSharedAudioWaitMs: 25,
    lastResultKey: "lastResult"
  });

  await delay(0);

  assert.equal(handled, true);
  assert.equal(resolveStarted, true);
  assert.equal(responses[0].ok, true);
  assert.equal(responses[0].result, direct);
  assert.deepEqual(responses[0].speech, {
    fallback: "audio",
    text: "Direct shared audio"
  });
  assert.deepEqual(calls, [
    ["getStorage", ["lastResult"]],
    ["requestSharedAudio", "Exampletown", null, {
      rate: 0.82,
      trace,
      directLookup: true,
      skipRefresh: true
    }],
    ["resolveSelection", "Exampletown", { useOnline: false, trace }],
    ["playAudio", direct.pronunciation.audio[0], 0.82, trace]
  ]);

  finishResolve();
});

test("runtime speak does not wait for slow stored-result miss before direct shared audio", async () => {
  const responses = [];
  const calls = [];
  const direct = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Direct shared audio",
        url: "https://community.example/audio/aud_1234567890abcdef",
        quality: "generated"
      }]
    }
  };
  const trace = {
    id: "trace-slow-storage",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };
  let storageFinished = false;
  let requestStartedBeforeStorageFinished = false;
  let playbackStartedBeforeStorageFinished = false;

  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    rate: 0.82,
    trace
  }, (value) => responses.push(value), {
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      await delay(60);
      storageFinished = true;
      return {};
    },
    requestSharedAudio: async (text, result, options) => {
      requestStartedBeforeStorageFinished = !storageFinished;
      calls.push(["requestSharedAudio", text, result, options]);
      return direct;
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return new Promise(() => {});
    },
    playAudio: async (audio, rate, messageTrace) => {
      playbackStartedBeforeStorageFinished = !storageFinished;
      calls.push(["playAudio", audio, rate, messageTrace]);
      return true;
    },
    speakResult: async () => {
      throw new Error("should not speak when direct shared audio plays");
    },
    directSharedAudioWaitMs: 100,
    storedResultGraceMs: 5,
    lastResultKey: "lastResult"
  });

  await delay(25);

  assert.equal(handled, true);
  assert.equal(requestStartedBeforeStorageFinished, true);
  assert.equal(playbackStartedBeforeStorageFinished, true);
  assert.equal(responses[0].ok, true);
  assert.equal(responses[0].result, direct);
  assert.deepEqual(responses[0].speech, {
    fallback: "audio",
    text: "Direct shared audio"
  });
  assert.deepEqual(calls.slice(0, 3), [
    ["getStorage", ["lastResult"]],
    ["requestSharedAudio", "Exampletown", null, {
      rate: 0.82,
      trace,
      directLookup: true,
      skipRefresh: true
    }],
    ["playAudio", direct.pronunciation.audio[0], 0.82, trace]
  ]);
});

test("runtime speak plays resolved audio before slow direct shared-audio miss", async () => {
  const responses = [];
  const calls = [];
  const resolved = {
    query: "Exampletown",
    pronunciation: {
      audio: [{
        label: "Resolved recording",
        url: "https://example.com/resolved.ogg",
        quality: "source-backed"
      }]
    }
  };
  const trace = {
    id: "trace-resolved-before-direct",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };
  let directFinished = false;
  let playbackStartedBeforeDirectFinished = false;
  let finishDirect;
  const directMiss = new Promise((resolve) => {
    finishDirect = () => {
      directFinished = true;
      resolve(null);
    };
  });

  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    rate: 0.82,
    trace
  }, (value) => responses.push(value), {
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return {};
    },
    requestSharedAudio: async (text, result, options) => {
      calls.push(["requestSharedAudio", text, result, options]);
      return directMiss;
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return resolved;
    },
    playAudio: async (audio, rate, messageTrace) => {
      playbackStartedBeforeDirectFinished = !directFinished;
      calls.push(["playAudio", audio, rate, messageTrace]);
      return true;
    },
    speakResult: async () => {
      throw new Error("should not speak when resolved audio plays");
    },
    directSharedAudioWaitMs: 100,
    storedResultGraceMs: 5,
    lastResultKey: "lastResult"
  });

  await delay(25);

  assert.equal(handled, true);
  assert.equal(playbackStartedBeforeDirectFinished, true);
  assert.equal(responses[0].ok, true);
  assert.equal(responses[0].result, resolved);
  assert.deepEqual(responses[0].speech, {
    fallback: "audio",
    text: "Resolved recording"
  });
  assert.deepEqual(calls, [
    ["getStorage", ["lastResult"]],
    ["requestSharedAudio", "Exampletown", null, {
      rate: 0.82,
      trace,
      directLookup: true,
      skipRefresh: true
    }],
    ["resolveSelection", "Exampletown", { useOnline: false, trace }],
    ["playAudio", resolved.pronunciation.audio[0], 0.82, trace]
  ]);

  finishDirect();
});

test("runtime speak starts playback preparation before resolving", async () => {
  const responses = [];
  const calls = [];
  const trace = {
    id: "trace-prepare",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };
  const resolved = {
    query: "Exampletown",
    pronunciation: {
      audio: [{
        label: "Prepared recording",
        url: "https://example.com/prepared.ogg",
        quality: "source-backed"
      }]
    }
  };

  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    rate: 0.82,
    trace
  }, (value) => responses.push(value), {
    preparePlayback: async (messageTrace) => {
      calls.push(["preparePlayback", messageTrace]);
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return resolved;
    },
    playAudio: async (audio, rate, messageTrace) => {
      calls.push(["playAudio", audio, rate, messageTrace]);
      return true;
    },
    speakResult: async () => {
      throw new Error("should not speak when resolved audio plays");
    }
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(calls, [
    ["preparePlayback", trace],
    ["resolveSelection", "Exampletown", { useOnline: false, trace }],
    ["playAudio", resolved.pronunciation.audio[0], 0.82, trace]
  ]);
  assert.equal(responses[0].ok, true);
});

test("runtime speak falls back to resolving when stored-result read fails", async () => {
  const responses = [];
  const calls = [];
  const resolved = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL",
    pronunciation: {
      audio: [{
        label: "Resolved recording",
        url: "https://example.com/przykladowo.ogg",
        quality: "source-backed"
      }]
    }
  };
  const trace = {
    id: "trace-storage-error",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };

  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    rate: 0.82,
    trace
  }, (value) => responses.push(value), {
    getStorage: async () => {
      calls.push(["getStorage"]);
      throw new Error("storage temporarily unavailable");
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return resolved;
    },
    playAudio: async (audio, rate, messageTrace) => {
      calls.push(["playAudio", audio, rate, messageTrace]);
      return true;
    },
    speakResult: async () => {
      throw new Error("should not speak when resolved audio plays");
    },
    recordDebugEvent: (kind, payload) => calls.push(["recordDebugEvent", kind, payload]),
    lastResultKey: "lastResult"
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(calls, [
    ["recordDebugEvent", "ui:selection-auto-speak", {
      text: "Exampletown",
      trace
    }],
    ["getStorage"],
    ["recordDebugEvent", "stored-result:error", {
      text: "Exampletown",
      error: "storage temporarily unavailable",
      trace
    }],
    ["resolveSelection", "Exampletown", { useOnline: false, trace }],
    ["playAudio", resolved.pronunciation.audio[0], 0.82, trace]
  ]);
  assert.deepEqual(responses, [{
    ok: true,
    result: resolved,
    speech: {
      fallback: "audio",
      text: "Resolved recording"
    }
  }]);
});

test("falls back to speech when refreshed runtime audio cannot play", async () => {
  const responses = [];
  const calls = [];
  const supplied = {
    display: "Exampletown",
    sourceForm: "Exampletown",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
  const refreshed = {
    ...supplied,
    sourceForm: "Przykladowo",
    pronunciation: {
      audio: [{
        label: "Native recording",
        url: "https://example.com/przykladowo.ogg",
        quality: "verified"
      }]
    }
  };
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    result: supplied,
    rate: 0.82
  }, (value) => responses.push(value), {
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return refreshed;
    },
    playAudio: async (audio, rate) => {
      calls.push(["playAudio", audio, rate]);
      return false;
    },
    speakResult: async (result, options) => {
      calls.push(["speakResult", result, options]);
      return { spoken: true, text: result.sourceForm };
    }
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(calls, [
    ["resolveSelection", "Exampletown", { useOnline: true, localResult: supplied }],
    ["playAudio", refreshed.pronunciation.audio[0], 0.82],
    ["speakResult", refreshed, { rate: 0.82, lang: undefined }]
  ]);
  assert.deepEqual(responses, [{
    ok: true,
    result: refreshed,
    speech: {
      text: "Przykladowo"
    }
  }]);
});

test("skips shared audio retry when speak caller already tried it", async () => {
  const responses = [];
  const calls = [];
  const supplied = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    result: supplied,
    rate: 0.82,
    skipSharedAudio: true
  }, (value) => responses.push(value), {
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return supplied;
    },
    requestSharedAudio: async () => {
      throw new Error("shared audio should not be retried");
    },
    speakResult: async (result, options) => {
      calls.push(["speakResult", result, options]);
      return { spoken: true, text: result.sourceForm };
    }
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(calls, [
    ["resolveSelection", "Exampletown", { useOnline: true, localResult: supplied }],
    ["speakResult", supplied, { rate: 0.82, lang: undefined }]
  ]);
  assert.deepEqual(responses, [{
    ok: true,
    result: supplied,
    speech: {
      text: "Przykladowo"
    }
  }]);
});

test("returns guide speech metadata from speak messages", async () => {
  const responses = [];
  const resolved = { display: "Exampletown" };
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    result: resolved,
    rate: 0.82
  }, (value) => responses.push(value), {
    speakResult: async () => ({
      spoken: true,
      text: "eg-ZAM-pluh-town",
      fallback: "guide"
    })
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(responses, [{
    ok: true,
    result: resolved,
    speech: {
      fallback: "guide",
      text: "eg-ZAM-pluh-town"
    }
  }]);
});

test("routes extension-owned audio playback messages", async () => {
  const responses = [];
  const calls = [];
  const audio = {
    url: "https://voice.example/item.ogg",
    quality: "generated"
  };
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.playAudio,
    audio,
    rate: 0.7
  }, (value) => responses.push(value), {
    playAudio: async (item, rate) => {
      calls.push(["playAudio", item, rate]);
      return true;
    }
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(calls, [["playAudio", audio, 0.7]]);
  assert.deepEqual(responses, [{ ok: true }]);
});

test("routes prepare playback messages without resolving", async () => {
  const responses = [];
  const calls = [];
  const trace = {
    id: "trace-prepare",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.preparePlayback,
    trace
  }, (value) => responses.push(value), {
    preparePlayback: async (messageTrace) => {
      calls.push(["preparePlayback", messageTrace]);
    },
    resolveSelection: async () => {
      throw new Error("prepare should not resolve");
    }
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(calls, [["preparePlayback", trace]]);
  assert.deepEqual(responses, [{ ok: true }]);
});

test("runtime speak reuses prepared direct shared audio", async () => {
  const responses = [];
  const calls = [];
  const direct = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Prepared shared audio",
        url: "https://community.example/audio/aud_1234567890abcdef",
        quality: "generated"
      }]
    }
  };
  const trace = {
    id: "trace-prepared-direct",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };
  let finishDirect;
  const directPromise = new Promise((resolve) => {
    finishDirect = () => resolve(direct);
  });
  const dependencies = {
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return {};
    },
    requestSharedAudio: async (text, result, options) => {
      calls.push(["requestSharedAudio", text, result, options]);
      return directPromise;
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return new Promise(() => {});
    },
    playAudio: async (audio, rate, messageTrace) => {
      calls.push(["playAudio", audio, rate, messageTrace]);
      return true;
    },
    speakResult: async () => {
      throw new Error("should not speak when prepared shared audio plays");
    },
    preparedSharedAudioTtlMs: 200,
    directSharedAudioWaitMs: 200,
    lastResultKey: "lastResult"
  };

  const prepareHandled = handleRuntimeMessage({
    type: MESSAGE_TYPES.preparePlayback,
    text: "Exampletown",
    rate: 0.82,
    trace
  }, (value) => responses.push(["prepare", value]), dependencies);
  const speakHandled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    rate: 0.82,
    trace
  }, (value) => responses.push(["speak", value]), dependencies);

  finishDirect();
  await delay(30);

  assert.equal(prepareHandled, true);
  assert.equal(speakHandled, true);
  assert.equal(calls.filter((call) => call[0] === "requestSharedAudio").length, 1);
  assert.equal(responses[0][0], "prepare");
  assert.deepEqual(responses[0][1], { ok: true });
  assert.equal(responses[1][0], "speak");
  assert.equal(responses[1][1].ok, true);
  assert.equal(responses[1][1].result, direct);
  assert.deepEqual(responses[1][1].speech, {
    fallback: "audio",
    text: "Prepared shared audio"
  });
  assert.deepEqual(calls.slice(0, 4), [
    ["requestSharedAudio", "Exampletown", null, {
      rate: 0.82,
      trace,
      directLookup: true,
      skipRefresh: true
    }],
    ["getStorage", ["lastResult"]],
    ["resolveSelection", "Exampletown", { useOnline: false, trace }],
    ["playAudio", direct.pronunciation.audio[0], 0.82, trace]
  ]);
});

test("routes shared audio request messages", async () => {
  const responses = [];
  const calls = [];
  const result = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL"
  };
  const shared = {
    ...result,
    sourceStatus: "generated-audio"
  };
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.requestSharedAudio,
    text: "Exampletown",
    result,
    rate: 0.82
  }, (value) => responses.push(value), {
    requestSharedAudio: async (text, item, options) => {
      calls.push(["requestSharedAudio", text, item, options]);
      return shared;
    }
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(calls, [["requestSharedAudio", "Exampletown", result, { rate: 0.82 }]]);
  assert.deepEqual(responses, [{ ok: true, result: shared }]);
});

test("routes debug diagnostics messages", async () => {
  const responses = [];
  const diagnostics = {
    speechPlan: {
      lang: "pl-PL",
      selectedVoice: "Polish Remote"
    }
  };
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.getDebugState
  }, (value) => responses.push(value), {
    getDebugState: async () => diagnostics
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(responses, [{ ok: true, diagnostics }]);
});

test("routes debug event messages", () => {
  const responses = [];
  const calls = [];
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.debugEvent,
    kind: "audio:popup-start",
    payload: {
      elapsedMs: 120
    }
  }, (value) => responses.push(value), {
    recordDebugEvent: (kind, payload) => calls.push([kind, payload])
  });

  assert.equal(handled, true);
  assert.deepEqual(calls, [["audio:popup-start", { elapsedMs: 120 }]]);
  assert.deepEqual(responses, [{ ok: true }]);
});

test("reports missing matching voice from speak messages", async () => {
  const responses = [];
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    result: { display: "Exampletown", ttsLang: "pl-PL" }
  }, (value) => responses.push(value), {
    speakResult: async () => ({
      spoken: false,
      error: "No matching browser voice for pl-PL."
    })
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(responses, [{ ok: false, error: "No matching browser voice for pl-PL." }]);
});

test("reports missing speech result from speak messages", async () => {
  const responses = [];
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    result: { display: "" }
  }, (value) => responses.push(value), {
    speakResult: async () => undefined
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(responses, [{ ok: false, error: "Speech unavailable." }]);
});

test("rejects speak messages without selected text", () => {
  const responses = [];
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: " "
  }, (value) => responses.push(value), {});

  assert.equal(handled, true);
  assert.deepEqual(responses, [{ ok: false, error: "No text selected." }]);
});

test("acknowledges stop messages even when offscreen cleanup fails", async () => {
  const responses = [];
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.stop
  }, (value) => responses.push(value), {
    stopPlayback: async () => {
      throw new Error("not open");
    }
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(responses, [{ ok: true }]);
});

test("routes feedback, sync, and approved-entry runtime messages", async () => {
  const responses = [];
  const calls = [];
  const feedbackResult = { display: "Gnocchi", community: { confirmations: 1 } };
  const syncSummary = { pending: 0, sent: 1 };
  const pullSummary = { received: 2 };

  handleRuntimeMessage({
    type: MESSAGE_TYPES.feedback,
    text: "Gnocchi",
    feedback: { kind: "confirm" }
  }, (value) => responses.push(value), {
    saveFeedback: async (text, feedback) => {
      calls.push(["saveFeedback", text, feedback]);
      return feedbackResult;
    }
  });
  handleRuntimeMessage({ type: MESSAGE_TYPES.flushSync }, (value) => responses.push(value), {
    flushCommunitySync: async () => syncSummary
  });
  handleRuntimeMessage({ type: MESSAGE_TYPES.pullApproved }, (value) => responses.push(value), {
    pullApprovedCommunityEntries: async () => pullSummary
  });

  await delay(0);

  assert.deepEqual(calls, [["saveFeedback", "Gnocchi", { kind: "confirm" }]]);
  assert.deepEqual(responses, [
    { ok: true, result: feedbackResult },
    { ok: true, summary: syncSummary },
    { ok: true, summary: pullSummary }
  ]);
});

test("reports runtime message handler errors", async () => {
  const responses = [];
  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.resolve,
    text: "Gnocchi"
  }, (value) => responses.push(value), {
    resolveSelection: async () => {
      throw new Error("Resolver unavailable");
    }
  });

  await delay(0);

  assert.equal(handled, true);
  assert.deepEqual(responses, [{ ok: false, error: "Resolver unavailable" }]);
});
