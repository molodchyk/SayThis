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

test("speaks supplied runtime results without resolving again", async () => {
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
