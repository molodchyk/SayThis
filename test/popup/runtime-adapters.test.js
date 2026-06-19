import assert from "node:assert/strict";
import test from "node:test";
import {
  createPopupRuntimeAdapters,
  lookupHintsFromValue,
  openExtensionOptions,
  readActiveTabSelection,
  readPopupSettings,
  readStoredPopupState,
  sendRuntimeMessage,
  writeActiveTabPopupState
} from "../../src/popup/runtime-adapters.js";

test("creates popup runtime adapters from Chrome APIs", async () => {
  const calls = [];
  const chrome = {
    storage: {
      local: {
        get: async (keys) => {
          calls.push(["getStorage", keys]);
          return { ok: true };
        },
        set: async (value) => {
          calls.push(["setStorage", value]);
        }
      }
    },
    tabs: {
      query: async (query) => {
        calls.push(["queryTabs", query]);
        return [{ id: 7 }];
      },
      create: async (details) => {
        calls.push(["createTab", details]);
        return { id: 8 };
      }
    },
    scripting: {
      executeScript: async (details) => {
        calls.push(["executeScript", details.target]);
        return [{ result: "Gnocchi" }];
      }
    },
    runtime: {
      getURL: (path) => {
        calls.push(["getRuntimeUrl", path]);
        return `chrome-extension://id/${path}`;
      },
      lastError: null,
      sendMessage: (message, callback) => {
        calls.push(["sendMessage", message]);
        callback({ ok: true });
      },
      openOptionsPage: (callback) => {
        calls.push(["openOptionsPage"]);
        callback();
      }
    }
  };
  const adapters = createPopupRuntimeAdapters(chrome);

  assert.deepEqual(await adapters.getStorage(["settings"]), { ok: true });
  await adapters.setStorage({ lastSelection: "Gnocchi" });
  assert.deepEqual(await adapters.queryTabs({ active: true }), [{ id: 7 }]);
  assert.deepEqual(await adapters.createTab({ url: "chrome-extension://id/options.html" }), { id: 8 });
  assert.deepEqual(await adapters.executeScript({ target: { tabId: 7 } }), [{ result: "Gnocchi" }]);
  assert.equal(adapters.getRuntimeUrl("src/options/options.html"), "chrome-extension://id/src/options/options.html");
  assert.deepEqual(await sendRuntimeMessage({ type: "SAYTHIS_STOP" }, adapters), { ok: true });
  assert.deepEqual(await openExtensionOptions(adapters), { ok: true });
  assert.equal(adapters.lastError(), null);
  assert.deepEqual(calls, [
    ["getStorage", ["settings"]],
    ["setStorage", { lastSelection: "Gnocchi" }],
    ["queryTabs", { active: true }],
    ["createTab", { url: "chrome-extension://id/options.html" }],
    ["executeScript", { tabId: 7 }],
    ["getRuntimeUrl", "src/options/options.html"],
    ["sendMessage", { type: "SAYTHIS_STOP" }],
    ["openOptionsPage"]
  ]);
});

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

test("writes active-tab popup state", async () => {
  const writes = [];
  await writeActiveTabPopupState("  Gnocchi\nalla   romana ", {
    setStorage: async (value) => writes.push(value)
  });
  await writeActiveTabPopupState("  ", {
    setStorage: async () => {
      throw new Error("empty selection should not be stored");
    }
  });

  assert.deepEqual(writes, [{
    lastSelection: "Gnocchi alla romana",
    lastSource: "active-tab"
  }]);
});

test("reads and normalizes stored popup state", async () => {
  assert.deepEqual(await readStoredPopupState({
    getStorage: async (keys) => {
      assert.deepEqual(keys, ["lastSelection", "lastResult"]);
      return {
        lastSelection: "  Chiaroscuro\n ",
        lastResult: {
          display: "Chiaroscuro"
        }
      };
    }
  }), {
    lastSelection: "Chiaroscuro",
    lastResult: {
      display: "Chiaroscuro"
    }
  });

  assert.deepEqual(await readStoredPopupState({
    getStorage: async () => ({
      lastSelection: "  ",
      lastResult: []
    })
  }), {
    lastSelection: "",
    lastResult: null
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

test("opens extension options with error normalization", async () => {
  assert.deepEqual(await openExtensionOptions({
    openOptionsPage: (respond) => respond(),
    lastError: () => null
  }), { ok: true });

  assert.deepEqual(await openExtensionOptions({
    openOptionsPage: () => Promise.resolve(),
    lastError: () => null
  }), { ok: true });

  const openedTabs = [];
  assert.deepEqual(await openExtensionOptions({
    getRuntimeUrl: (path) => `chrome-extension://id/${path}`,
    createTab: async (details) => openedTabs.push(details)
  }, { pageHash: "debug" }), { ok: true });
  assert.deepEqual(openedTabs, [{
    url: "chrome-extension://id/src/options/options.html#debug"
  }]);

  assert.deepEqual(await openExtensionOptions({
    openOptionsPage: (respond) => respond(),
    lastError: () => ({ message: "Cannot open options" })
  }), { ok: false, error: "Cannot open options" });

  assert.deepEqual(await openExtensionOptions({
    openOptionsPage: () => {
      throw new Error("Popup unavailable");
    },
    lastError: () => null
  }), { ok: false, error: "Popup unavailable" });

  assert.deepEqual(await openExtensionOptions(), {
    ok: false,
    error: "Options unavailable."
  });
});

test("normalizes lookup hints", () => {
  assert.deepEqual(lookupHintsFromValue(" pl, pt-BR, bad!, ja, pl "), ["pl", "pt", "ja"]);
});
