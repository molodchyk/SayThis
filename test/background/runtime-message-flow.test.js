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
