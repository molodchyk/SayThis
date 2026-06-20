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
import {
  clearPreparedSharedAudioForTests
} from "../../src/background/prepared-shared-audio-flow.js";

async function firstResponseWithin(responses, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (responses.length) {
      return responses[0];
    }

    await delay(1);
  }

  return "timeout";
}

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

test("runtime speak stores selection and result without waiting for storage writes", async () => {
  const calls = [];
  const resolved = {
    query: "Exampletown",
    display: "Exampletown",
    pronunciation: {
      audio: [{
        label: "Resolved recording",
        url: "https://example.com/resolved.mp3",
        quality: "source-backed"
      }]
    }
  };
  const trace = {
    id: "trace-store-runtime",
    source: "popup",
    action: "popup-speak",
    startedAt: Date.now()
  };
  const responsePromise = new Promise((resolve) => {
    const handled = handleRuntimeMessage({
      type: MESSAGE_TYPES.speak,
      text: "Exampletown",
      rate: 0.82,
      trace
    }, resolve, {
      getStorage: async (keys) => {
        calls.push(["getStorage", keys]);
        return {};
      },
      setStorage: (value) => {
        calls.push(["setStorage", value]);
        return new Promise(() => {});
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
      lastResultKey: "lastResult",
      lastSelectionKey: "lastSelection",
      lastSourceKey: "lastSource"
    });
    assert.equal(handled, true);
  });

  const response = await Promise.race([
    responsePromise,
    delay(50).then(() => "timeout")
  ]);

  assert.notEqual(response, "timeout");
  assert.equal(response.ok, true);
  assert.equal(response.result, resolved);
  assert.deepEqual(calls, [
    ["setStorage", {
      lastSelection: "Exampletown",
      lastSource: "popup-speak"
    }],
    ["getStorage", ["lastResult"]],
    ["resolveSelection", "Exampletown", { trace }],
    ["playAudio", resolved.pronunciation.audio[0], 0.82, trace],
    ["setStorage", { lastResult: resolved }]
  ]);
});

test("runtime speak reuses visible overlay audio before storage or lookup", async () => {
  const responses = [];
  const calls = [];
  const visible = {
    query: "Exampletown",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Visible shared audio",
        url: "https://community.example/audio/aud_visible",
        quality: "generated"
      }]
    }
  };
  const trace = {
    id: "trace-visible",
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
    getVisibleResult: async () => {
      calls.push(["getVisibleResult"]);
      return visible;
    },
    getStorage: async () => {
      throw new Error("should not read storage when visible audio matches");
    },
    resolveSelection: async () => {
      throw new Error("should not resolve when visible audio matches");
    },
    requestSharedAudio: async () => {
      throw new Error("should not request shared audio when visible audio matches");
    },
    playAudio: async (audio, rate, messageTrace) => {
      calls.push(["playAudio", audio, rate, messageTrace]);
      return true;
    },
    speakResult: async () => {
      throw new Error("should not speak when visible audio plays");
    },
    recordDebugEvent: (kind, payload) => calls.push(["recordDebugEvent", kind, payload]),
    lastResultKey: "lastResult"
  });

  await delay(0);

  assert.equal(handled, true);
  assert.equal(responses[0].ok, true);
  assert.equal(responses[0].result, visible);
  assert.deepEqual(responses[0].speech, {
    fallback: "audio",
    text: "Visible shared audio"
  });
  assert.deepEqual(calls, [
    ["recordDebugEvent", "ui:selection-auto-speak", {
      text: "Exampletown",
      trace
    }],
    ["getVisibleResult"],
    ["recordDebugEvent", "visible-result:hit", {
      text: "Exampletown",
      sourceStatus: "generated-audio",
      audioQuality: "generated",
      trace
    }],
    ["playAudio", visible.pronunciation.audio[0], 0.82, trace]
  ]);
});

test("select-to-hear reuses local approved shared audio before a slow visible probe", async () => {
  clearPreparedSharedAudioForTests();
  const responses = [];
  const calls = [];
  const localShared = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Local approved shared audio",
        url: "https://community.example/audio/aud_local_approved",
        quality: "generated"
      }]
    }
  };
  const trace = {
    id: "trace-local-approved-before-visible",
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
    getVisibleResult: async () => {
      calls.push(["getVisibleResult"]);
      return new Promise(() => {});
    },
    requestSharedAudio: async (text, result, options) => {
      calls.push(["requestSharedAudio", text, result, options]);
      return options.sharedAudioLocalOnly ? localShared : null;
    },
    resolveSelection: async () => {
      throw new Error("should not resolve before local approved shared audio plays");
    },
    playAudio: async (audio, rate, messageTrace) => {
      calls.push(["playAudio", audio, rate, messageTrace]);
      return true;
    },
    speakResult: async () => {
      throw new Error("should not speak when local approved shared audio plays");
    },
    visibleResultGraceMs: 100,
    directSharedAudioWaitMs: 60,
    lastResultKey: "lastResult"
  });

  await delay(30);

  assert.equal(handled, true);
  assert.equal(responses[0].ok, true);
  assert.equal(responses[0].result, localShared);
  assert.deepEqual(responses[0].speech, {
    fallback: "audio",
    text: "Local approved shared audio"
  });
  assert.deepEqual(calls, [
    ["getVisibleResult"],
    ["requestSharedAudio", "Exampletown", null, {
      rate: 0.82,
      trace,
      directLookup: true,
      skipRefresh: true,
      sharedAudioLocalOnly: true
    }],
    ["playAudio", localShared.pronunciation.audio[0], 0.82, trace]
  ]);
  clearPreparedSharedAudioForTests();
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
    ["requestSharedAudio", "Exampletown", null, {
      rate: 0.82,
      trace,
      directLookup: true,
      skipRefresh: true,
      sharedAudioLocalOnly: true
    }],
    ["getStorage", ["lastResult"]],
    ["resolveSelection", "Exampletown", { useOnline: false, trace }],
    ["playAudio", direct.pronunciation.audio[0], 0.82, trace]
  ]);

  finishResolve();
});

test("runtime speak still plays shared audio after the fast wait window", async () => {
  clearPreparedSharedAudioForTests();
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
        label: "Delayed shared audio",
        url: "https://community.example/audio/aud_delayed",
        quality: "generated"
      }]
    }
  };
  const trace = {
    id: "trace-delayed-direct",
    source: "popup",
    action: "popup-speak",
    startedAt: Date.now()
  };
  const responsePromise = new Promise((resolve) => {
    const handled = handleRuntimeMessage({
      type: MESSAGE_TYPES.speak,
      text: "Exampletown",
      rate: 0.82,
      trace
    }, resolve, {
      getStorage: async (keys) => {
        calls.push(["getStorage", keys]);
        return {};
      },
      requestSharedAudio: async (text, result, options) => {
        calls.push(["requestSharedAudio", text, result, options]);
        await delay(75);
        return result || direct;
      },
      resolveSelection: async (text, options) => {
        calls.push(["resolveSelection", text, options]);
        await delay(500);
        return { display: "Late result" };
      },
      playAudio: async (audio, rate, messageTrace) => {
        calls.push(["playAudio", audio, rate, messageTrace]);
        return true;
      },
      speakResult: async () => {
        throw new Error("should not speak when delayed shared audio plays");
      },
      directSharedAudioWaitMs: 5,
      directSharedAudioFallbackWaitMs: 150,
      lastResultKey: "lastResult"
    });
    assert.equal(handled, true);
  });

  const response = await Promise.race([
    responsePromise,
    delay(250).then(() => "timeout")
  ]);

  assert.notEqual(response, "timeout");
  assert.equal(response.ok, true);
  assert.equal(response.result, direct);
  assert.deepEqual(response.speech, {
    fallback: "audio",
    text: "Delayed shared audio"
  });
  assert.equal(calls.some((call) => call[0] === "playAudio" && call[1] === direct.pronunciation.audio[0]), true);
  clearPreparedSharedAudioForTests();
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
  let resolveStartedBeforeStorageFinished = false;
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
      resolveStartedBeforeStorageFinished = !storageFinished;
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
    storedResultGraceMs: 80,
    lastResultKey: "lastResult"
  });

  await delay(25);

  assert.equal(handled, true);
  assert.equal(requestStartedBeforeStorageFinished, true);
  assert.equal(resolveStartedBeforeStorageFinished, true);
  assert.equal(playbackStartedBeforeStorageFinished, true);
  assert.equal(responses[0].ok, true);
  assert.equal(responses[0].result, direct);
  assert.deepEqual(responses[0].speech, {
    fallback: "audio",
    text: "Direct shared audio"
  });
  assert.deepEqual(calls.slice(0, 2), [
    ["requestSharedAudio", "Exampletown", null, {
      rate: 0.82,
      trace,
      directLookup: true,
      skipRefresh: true,
      sharedAudioLocalOnly: true
    }],
    ["getStorage", ["lastResult"]]
  ]);
  assert.equal(calls.some((call) =>
    call[0] === "playAudio" &&
    call[1] === direct.pronunciation.audio[0] &&
    call[2] === 0.82 &&
    call[3] === trace
  ), true);
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
      return options.sharedAudioLocalOnly ? null : directMiss;
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
  assert.equal(calls.some((call) =>
    call[0] === "requestSharedAudio" &&
    call[3]?.sharedAudioLocalOnly === true
  ), true);
  assert.equal(calls.some((call) =>
    call[0] === "requestSharedAudio" &&
    call[3]?.directLookup === true &&
    call[3]?.sharedAudioLocalOnly !== true
  ), true);
  assert.equal(calls.some((call) =>
    call[0] === "playAudio" &&
    call[1] === resolved.pronunciation.audio[0] &&
    call[2] === 0.82 &&
    call[3] === trace
  ), true);

  finishDirect();
});

test("select-to-hear speaks resolved source form before slow direct shared-audio miss", async () => {
  const responses = [];
  const calls = [];
  const resolved = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
  const trace = {
    id: "trace-source-form-before-direct",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };
  let directFinished = false;
  let speechStartedBeforeDirectFinished = false;
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
      return result ? result : options.sharedAudioLocalOnly ? null : directMiss;
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      return resolved;
    },
    playAudio: async () => {
      throw new Error("should not play audio when direct shared audio has not resolved");
    },
    speakResult: async (result, options) => {
      speechStartedBeforeDirectFinished = !directFinished;
      calls.push(["speakResult", result, options]);
      return {
        spoken: true,
        text: result.sourceForm,
        options: {
          lang: result.ttsLang
        }
      };
    },
    directSharedAudioWaitMs: 100,
    selectionAudioFallbackWaitMs: 5,
    storedResultGraceMs: 5,
    lastResultKey: "lastResult"
  });

  await delay(25);

  assert.equal(handled, true);
  assert.equal(speechStartedBeforeDirectFinished, true);
  assert.equal(responses[0].ok, true);
  assert.equal(responses[0].result, resolved);
  assert.deepEqual(responses[0].speech, {
    text: "Przykladowo"
  });
  assert.equal(calls.some((call) =>
    call[0] === "requestSharedAudio" &&
    call[2] === null &&
    call[3]?.sharedAudioLocalOnly === true
  ), true);
  assert.equal(calls.some((call) =>
    call[0] === "requestSharedAudio" &&
    call[2] === null &&
    call[3]?.directLookup === true &&
    call[3]?.sharedAudioLocalOnly !== true
  ), true);
  assert.equal(calls.some((call) =>
    call[0] === "requestSharedAudio" &&
    call[2] === resolved &&
    call[3]?.sharedAudioLocalOnly === true
  ), true);
  assert.equal(calls.some((call) =>
    call[0] === "speakResult" &&
    call[1] === resolved &&
    call[2]?.trace === trace
  ), true);

  finishDirect();
});

test("select-to-hear lets delayed direct shared audio beat source-form speech fallback", async () => {
  const responses = [];
  const calls = [];
  const resolved = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
  const direct = {
    ...resolved,
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Delayed shared audio",
        url: "https://community.example/audio/aud_delayed_direct",
        quality: "generated"
      }]
    }
  };
  const trace = {
    id: "trace-delayed-direct-before-speech",
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
      return {};
    },
    requestSharedAudio: async (text, result, options) => {
      calls.push(["requestSharedAudio", text, result, options]);
      if (options.sharedAudioLocalOnly) {
        return null;
      }
      if (result) {
        return result;
      }
      await delay(45);
      return direct;
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
      throw new Error("should not speak source-form fallback when delayed shared audio arrives");
    },
    directSharedAudioWaitMs: 5,
    selectionAudioFallbackWaitMs: 80,
    storedResultGraceMs: 5,
    lastResultKey: "lastResult"
  });

  await delay(90);

  assert.equal(handled, true);
  assert.equal(responses[0].ok, true);
  assert.equal(responses[0].result, direct);
  assert.deepEqual(responses[0].speech, {
    fallback: "audio",
    text: "Delayed shared audio"
  });
  assert.equal(calls.some((call) =>
    call[0] === "requestSharedAudio" &&
    call[2] === null &&
    call[3]?.sharedAudioLocalOnly === true
  ), true);
  assert.equal(calls.some((call) =>
    call[0] === "requestSharedAudio" &&
    call[2] === null &&
    call[3]?.directLookup === true &&
    call[3]?.sharedAudioLocalOnly !== true
  ), true);
  assert.equal(calls.some((call) =>
    call[0] === "playAudio" &&
    call[1] === direct.pronunciation.audio[0] &&
    call[2] === 0.82 &&
    call[3] === trace
  ), true);
});

test("select-to-hear uses resolved fallback after the selection audio budget", async () => {
  const responses = [];
  const calls = [];
  const resolved = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
  const direct = {
    ...resolved,
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Delayed shared audio",
        url: "https://community.example/audio/aud_after_budget",
        quality: "generated"
      }]
    }
  };
  const trace = {
    id: "trace-selection-budget-before-direct",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };
  let finishDirect;
  const directPromise = new Promise((resolve) => {
    finishDirect = () => resolve(direct);
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
      if (options.sharedAudioLocalOnly || result) {
        return null;
      }

      return directPromise;
    },
    resolveSelection: async (text, options) => {
      calls.push(["resolveSelection", text, options]);
      await delay(35);
      return resolved;
    },
    playAudio: async () => {
      throw new Error("should not wait for delayed shared audio after the selection budget");
    },
    speakResult: async (result, options) => {
      calls.push(["speakResult", result, options]);
      return {
        spoken: true,
        text: result.sourceForm,
        options: {
          lang: result.ttsLang
        }
      };
    },
    directSharedAudioWaitMs: 5,
    selectionAudioFallbackWaitMs: 25,
    directSharedAudioFallbackWaitMs: 300,
    storedResultGraceMs: 5,
    sharedAudioWaitMs: 5,
    lastResultKey: "lastResult"
  });

  const response = await firstResponseWithin(responses, 100);

  assert.equal(handled, true);
  assert.notEqual(response, "timeout");
  assert.equal(response.ok, true);
  assert.equal(response.result, resolved);
  assert.deepEqual(response.speech, {
    text: "Przykladowo"
  });
  assert.equal(calls.some((call) =>
    call[0] === "requestSharedAudio" &&
    call[2] === null &&
    call[3]?.directLookup === true &&
    call[3]?.sharedAudioLocalOnly !== true
  ), true);
  assert.equal(calls.some((call) => call[0] === "speakResult" && call[1] === resolved), true);

  finishDirect();
  await delay(0);
});

test("select-to-hear rechecks resolved local shared audio after direct lookup misses", async () => {
  const responses = [];
  const calls = [];
  const resolved = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
  const shared = {
    ...resolved,
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Local shared audio",
        url: "https://audio.example/shared.mp3",
        quality: "generated"
      }]
    }
  };
  const trace = {
    id: "trace-direct-miss",
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
      return {};
    },
    requestSharedAudio: async (text, result, options) => {
      calls.push(["requestSharedAudio", text, result, options]);
      return result ? shared : null;
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
      throw new Error("should not speak when local shared audio is available");
    },
    directSharedAudioWaitMs: 25,
    storedResultGraceMs: 5,
    lastResultKey: "lastResult"
  });

  await delay(0);

  assert.equal(handled, true);
  assert.equal(responses[0].ok, true);
  assert.equal(responses[0].result, shared);
  assert.deepEqual(responses[0].speech, {
    fallback: "audio",
    text: "Local shared audio"
  });
  assert.equal(calls.some((call) =>
    call[0] === "requestSharedAudio" &&
    call[2] === null &&
    call[3]?.sharedAudioLocalOnly === true
  ), true);
  assert.equal(calls.some((call) =>
    call[0] === "requestSharedAudio" &&
    call[2] === null &&
    call[3]?.directLookup === true &&
    call[3]?.sharedAudioLocalOnly !== true
  ), true);
  assert.equal(calls.some((call) =>
    call[0] === "requestSharedAudio" &&
    call[2] === resolved &&
    call[3]?.sharedAudioLocalOnly === true
  ), true);
  assert.equal(calls.some((call) =>
    call[0] === "playAudio" &&
    call[1] === shared.pronunciation.audio[0] &&
    call[2] === 0.82 &&
    call[3] === trace
  ), true);
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
  assert.deepEqual(calls[0], ["recordDebugEvent", "ui:selection-auto-speak", {
    text: "Exampletown",
    trace
  }]);
  assert.deepEqual(calls[1], ["getStorage"]);
  assert.deepEqual(calls.find((call) => call[0] === "recordDebugEvent" && call[1] === "stored-result:error"), [
    "recordDebugEvent",
    "stored-result:error",
    {
      text: "Exampletown",
      error: "storage temporarily unavailable",
      trace
    }
  ]);
  assert.deepEqual(calls.find((call) => call[0] === "resolveSelection"), [
    "resolveSelection",
    "Exampletown",
    { useOnline: false, trace }
  ]);
  assert.deepEqual(calls.find((call) => call[0] === "playAudio"), [
    "playAudio",
    resolved.pronunciation.audio[0],
    0.82,
    trace
  ]);
  assert.equal(
    calls.findIndex((call) => call[0] === "resolveSelection") <
      calls.findIndex((call) => call[0] === "recordDebugEvent" && call[1] === "stored-result:error"),
    true
  );
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

test("select-to-hear speak can start prepared shared audio itself", async () => {
  clearPreparedSharedAudioForTests();
  const responses = [];
  const calls = [];
  const resolved = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
  const direct = {
    ...resolved,
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Self-prepared shared audio",
        url: "https://community.example/audio/aud_self_prepared",
        quality: "generated"
      }]
    }
  };
  const trace = {
    id: "trace-self-prepared-direct",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };
  const dependencies = {
    getVisibleResult: async () => {
      calls.push(["getVisibleResult"]);
      return null;
    },
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return {};
    },
    requestSharedAudio: async (text, result, options) => {
      calls.push(["requestSharedAudio", text, result, options]);
      return direct;
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
      throw new Error("should not speak when self-prepared shared audio plays");
    },
    directSharedAudioWaitMs: 120,
    lastResultKey: "lastResult"
  };

  const handled = handleRuntimeMessage({
    type: MESSAGE_TYPES.speak,
    text: "Exampletown",
    rate: 0.82,
    prepareSharedAudio: true,
    trace
  }, (value) => responses.push(value), dependencies);

  await delay(70);

  assert.equal(handled, true);
  assert.equal(responses[0].ok, true);
  assert.equal(responses[0].result, direct);
  assert.deepEqual(responses[0].speech, {
    fallback: "audio",
    text: "Self-prepared shared audio"
  });
  assert.equal(calls.filter((call) => call[0] === "requestSharedAudio").length, 1);
  assert.equal(calls.some((call) => call[0] === "getVisibleResult"), true);
  assert.equal(calls.some((call) =>
    call[0] === "playAudio" &&
    call[1] === direct.pronunciation.audio[0] &&
    call[2] === 0.82 &&
    call[3] === trace
  ), true);
  clearPreparedSharedAudioForTests();
});

test("select-to-hear lets fast prepared shared audio beat source-form fallback", async () => {
  clearPreparedSharedAudioForTests();
  const responses = [];
  const calls = [];
  const resolved = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
  const direct = {
    ...resolved,
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Prepared shared audio",
        url: "https://community.example/audio/aud_prepared_fast",
        quality: "generated"
      }]
    }
  };
  const trace = {
    id: "trace-prepared-direct-before-fallback",
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
      return result ? null : directPromise;
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
      throw new Error("should not speak source-form fallback when prepared audio is fast");
    },
    preparedAudioFallbackGraceMs: 50,
    preparedSharedAudioTtlMs: 200,
    directSharedAudioWaitMs: 120,
    lastResultKey: "lastResult"
  };

  handleRuntimeMessage({
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

  setTimeout(finishDirect, 15);
  await delay(90);

  assert.equal(speakHandled, true);
  assert.equal(responses[0][0], "prepare");
  assert.deepEqual(responses[0][1], { ok: true });
  assert.equal(responses[1][0], "speak");
  assert.equal(responses[1][1].ok, true);
  assert.equal(responses[1][1].result, direct);
  assert.deepEqual(responses[1][1].speech, {
    fallback: "audio",
    text: "Prepared shared audio"
  });
  assert.equal(calls.some((call) => call[0] === "getStorage"), false);
  assert.deepEqual(calls, [
    ["requestSharedAudio", "Exampletown", null, {
      rate: 0.82,
      trace,
      directLookup: true,
      skipRefresh: true
    }],
    ["resolveSelection", "Exampletown", { useOnline: false, trace }],
    ["playAudio", direct.pronunciation.audio[0], 0.82, trace]
  ]);
  clearPreparedSharedAudioForTests();
});

test("select-to-hear waits for pending prepared shared audio before speech fallback", async () => {
  clearPreparedSharedAudioForTests();
  const responses = [];
  const calls = [];
  const resolved = {
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    sourceStatus: "structured-source"
  };
  const direct = {
    ...resolved,
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Prepared shared audio",
        url: "https://community.example/audio/aud_prepared_slow",
        quality: "generated"
      }]
    }
  };
  const trace = {
    id: "trace-prepared-direct-before-speech-fallback",
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
      return result ? null : directPromise;
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
      throw new Error("should wait for prepared shared audio before speech fallback");
    },
    preparedSharedAudioWaitMs: 50,
    selectionAudioFallbackWaitMs: 300,
    preparedSharedAudioTtlMs: 1000,
    directSharedAudioWaitMs: 50,
    lastResultKey: "lastResult"
  };

  handleRuntimeMessage({
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

  setTimeout(finishDirect, 180);
  await delay(260);

  const speakResponse = responses.find(([kind]) => kind === "speak")?.[1];
  assert.equal(speakHandled, true);
  assert.ok(speakResponse);
  assert.equal(speakResponse.ok, true);
  assert.equal(speakResponse.result, direct);
  assert.deepEqual(speakResponse.speech, {
    fallback: "audio",
    text: "Prepared shared audio"
  });
  assert.equal(calls.filter((call) => call[0] === "requestSharedAudio").length, 1);
  assert.equal(calls.some((call) => call[0] === "playAudio" && call[1] === direct.pronunciation.audio[0]), true);
  clearPreparedSharedAudioForTests();
});

test("select-to-hear skips visible and stored probes when prepared shared audio is pending", async () => {
  clearPreparedSharedAudioForTests();
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
        url: "https://community.example/audio/aud_prepared_visible_probe",
        quality: "generated"
      }]
    }
  };
  const trace = {
    id: "trace-prepared-before-visible-probe",
    source: "content-selection",
    action: "select-to-hear",
    startedAt: Date.now()
  };
  let finishDirect;
  const directPromise = new Promise((resolve) => {
    finishDirect = () => resolve(direct);
  });
  const dependencies = {
    getVisibleResult: async () => {
      calls.push(["getVisibleResult"]);
      return new Promise(() => {});
    },
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
    visibleResultGraceMs: 100,
    preparedSharedAudioTtlMs: 200,
    directSharedAudioWaitMs: 200,
    lastResultKey: "lastResult"
  };

  handleRuntimeMessage({
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

  setTimeout(finishDirect, 10);
  await delay(60);

  const speakResponse = responses.find(([kind]) => kind === "speak")?.[1];
  assert.equal(speakHandled, true);
  assert.ok(speakResponse);
  assert.equal(speakResponse.ok, true);
  assert.equal(speakResponse.result, direct);
  assert.deepEqual(speakResponse.speech, {
    fallback: "audio",
    text: "Prepared shared audio"
  });
  assert.equal(calls.filter((call) => call[0] === "requestSharedAudio").length, 1);
  assert.equal(calls.some((call) => call[0] === "getVisibleResult"), false);
  assert.equal(calls.some((call) => call[0] === "getStorage"), false);
  assert.deepEqual(calls.slice(0, 3), [
    ["requestSharedAudio", "Exampletown", null, {
      rate: 0.82,
      trace,
      directLookup: true,
      skipRefresh: true
    }],
    ["resolveSelection", "Exampletown", { useOnline: false, trace }],
    ["playAudio", direct.pronunciation.audio[0], 0.82, trace]
  ]);
  clearPreparedSharedAudioForTests();
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
  assert.equal(calls.some((call) => call[0] === "getStorage"), false);
  assert.deepEqual(calls.slice(0, 3), [
    ["requestSharedAudio", "Exampletown", null, {
      rate: 0.82,
      trace,
      directLookup: true,
      skipRefresh: true
    }],
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
