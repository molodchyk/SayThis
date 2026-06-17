import assert from "node:assert/strict";
import test from "node:test";
import {
  lookupHintsFromValue,
  readActiveTabSelection,
  readPopupSettings,
  sendRuntimeMessage
} from "../../src/popup/runtime-adapters.js";

test("reads and normalizes active tab selection", async () => {
  const calls = [];
  const selection = await readActiveTabSelection({
    queryTabs: async (query) => {
      calls.push(["queryTabs", query]);
      return [{ id: 7 }];
    },
    executeScript: async (details) => {
      calls.push(["executeScript", details.target]);
      return [{ result: "  Gnocchi\nalla   romana " }];
    }
  });

  assert.equal(selection, "Gnocchi alla romana");
  assert.deepEqual(calls, [
    ["queryTabs", { active: true, currentWindow: true }],
    ["executeScript", { tabId: 7 }]
  ]);
});

test("returns empty selection when there is no readable active tab", async () => {
  assert.equal(await readActiveTabSelection({
    queryTabs: async () => []
  }), "");
  assert.equal(await readActiveTabSelection({
    queryTabs: async () => [{ id: 7 }],
    executeScript: async () => {
      throw new Error("restricted page");
    }
  }), "");
});

test("normalizes popup settings", async () => {
  assert.deepEqual(await readPopupSettings({
    getStorage: async () => ({})
  }), {
    autoSpeakPopup: true
  });
  assert.deepEqual(await readPopupSettings({
    getStorage: async () => ({
      settings: {
        onlineByDefault: true,
        autoSpeakPopup: false
      }
    })
  }), {
    autoSpeakPopup: false,
    onlineByDefault: true
  });
});

test("sends runtime messages with error normalization", async () => {
  assert.deepEqual(await sendRuntimeMessage({ type: "SAYTHIS_STOP" }, {
    sendMessage: (_message, respond) => respond({ ok: true }),
    lastError: () => null
  }), { ok: true });

  assert.deepEqual(await sendRuntimeMessage({ type: "SAYTHIS_STOP" }, {
    sendMessage: (_message, respond) => respond(undefined),
    lastError: () => ({ message: "No receiver" })
  }), { ok: false, error: "No receiver" });

  assert.deepEqual(await sendRuntimeMessage({ type: "SAYTHIS_STOP" }, {
    sendMessage: (_message, respond) => respond(undefined),
    lastError: () => null
  }), { ok: false, error: "No response." });

  assert.deepEqual(await sendRuntimeMessage({ type: "SAYTHIS_STOP" }), {
    ok: false,
    error: "Runtime messaging unavailable."
  });
});

test("normalizes lookup hints", () => {
  assert.deepEqual(lookupHintsFromValue(" pl, pt-BR, bad!, ja, pl "), ["pl", "pt", "ja"]);
});
