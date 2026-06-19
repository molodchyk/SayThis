import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKGROUND_OFFSCREEN_AUDIO_URL,
  BACKGROUND_STORAGE_KEYS,
  createBackgroundPlatformAdapters,
  createPlaybackSurfacePlatformDependencies,
  createRuntimeAdapterPlatformDependencies
} from "../../src/background/runtime-platform.js";

test("defines stable background storage keys", () => {
  assert.equal(BACKGROUND_OFFSCREEN_AUDIO_URL, "src/offscreen-audio.html");
  assert.deepEqual(Object.keys(BACKGROUND_STORAGE_KEYS).sort(), [
    "approvedCommunityEntries",
    "communityEntries",
    "communityPullState",
    "credentials",
    "lastResult",
    "lastSelection",
    "lastSource",
    "resultCache",
    "settings",
    "syncQueue",
    "syncSummary"
  ]);
});

test("maps background platform adapters to browser APIs", async () => {
  const calls = [];
  const listeners = {};
  const chromeApi = {
    commands: {
      onCommand: {
        addListener: listener => {
          listeners.command = listener;
        }
      }
    },
    contextMenus: {
      create: item => calls.push(["createContextMenu", item]),
      onClicked: {
        addListener: listener => {
          listeners.contextMenu = listener;
        }
      }
    },
    offscreen: {
      hasDocument: async () => {
        calls.push(["hasDocument"]);
        return true;
      },
      createDocument: async options => calls.push(["createOffscreenDocument", options])
    },
    runtime: {
      getManifest: () => ({ name: "SayThis", version: "1.0.0", manifest_version: 3 }),
      getURL: url => `chrome-extension://id/${url}`,
      sendMessage: async message => {
        calls.push(["sendRuntimeMessage", message]);
        return { ok: true };
      },
      onInstalled: {
        addListener: listener => {
          listeners.installed = listener;
        }
      },
      onMessage: {
        addListener: listener => {
          listeners.message = listener;
        }
      }
    },
    scripting: {
      executeScript: async details => calls.push(["executeScript", details])
    },
    storage: {
      local: {
        get: async keys => {
          calls.push(["getStorage", keys]);
          return { settings: {} };
        },
        set: async value => calls.push(["setStorage", value])
      }
    },
    tabs: {
      query: async query => {
        calls.push(["queryTabs", query]);
        return [{ id: 7 }];
      },
      sendMessage: async (tabId, message) => calls.push(["sendTabMessage", tabId, message])
    },
    tts: {
      getVoices: callback => {
        calls.push(["getTtsVoices"]);
        callback([{ voiceName: "Italian", lang: "it-IT" }]);
      },
      speak: (text, options) => calls.push(["speakTts", text, options]),
      stop: () => calls.push(["stopTts"])
    }
  };
  const platform = createBackgroundPlatformAdapters(chromeApi, {
    fetch: async (url, options) => {
      calls.push(["fetch", url, options]);
      return { ok: true };
    },
    clients: {
      matchAll: async () => {
        calls.push(["matchClients"]);
        return [];
      }
    }
  });

  platform.addCommandListener(() => "command");
  platform.addContextMenuClickedListener(() => "context");
  platform.addInstalledListener(() => "installed");
  platform.addMessageListener(() => "message");
  platform.createContextMenu({ id: "saythis" });
  await platform.getStorage(["settings"]);
  await platform.setStorage({ settings: {} });
  await platform.queryTabs({ active: true });
  await platform.executeScript({ files: ["src/content-overlay.js"] });
  await platform.sendTabMessage(7, { type: "SAYTHIS_SHOW_RESULT" });
  await platform.sendRuntimeMessage({ type: "SAYTHIS_STOP" });
  assert.deepEqual(platform.getManifest(), { name: "SayThis", version: "1.0.0", manifest_version: 3 });
  assert.equal(platform.getRuntimeUrl("data/pronunciation-seed.json"), "chrome-extension://id/data/pronunciation-seed.json");
  assert.equal(platform.hasOffscreenAudioSupport(), true);
  assert.equal(await platform.hasOffscreenDocument(), true);
  await platform.createOffscreenDocument({ url: BACKGROUND_OFFSCREEN_AUDIO_URL });
  await platform.fetch("https://example.test/data.json", {
    method: "POST",
    headers: { Authorization: "Bearer token" },
    body: "{}"
  });
  await platform.matchClients();
  assert.deepEqual(await platform.getTtsVoices(), [{ voiceName: "Italian", lang: "it-IT" }]);
  platform.stopTts();
  assert.deepEqual(await platform.speakTts("gnocchi", { rate: 0.82 }), { ok: true });

  assert.deepEqual(Object.keys(listeners).sort(), ["command", "contextMenu", "installed", "message"]);
  assert.deepEqual(calls, [
    ["createContextMenu", { id: "saythis" }],
    ["getStorage", ["settings"]],
    ["setStorage", { settings: {} }],
    ["queryTabs", { active: true }],
    ["executeScript", { files: ["src/content-overlay.js"] }],
    ["sendTabMessage", 7, { type: "SAYTHIS_SHOW_RESULT" }],
    ["sendRuntimeMessage", { type: "SAYTHIS_STOP" }],
    ["hasDocument"],
    ["createOffscreenDocument", { url: BACKGROUND_OFFSCREEN_AUDIO_URL }],
    ["fetch", "https://example.test/data.json", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
      body: "{}"
    }],
    ["matchClients"],
    ["getTtsVoices"],
    ["stopTts"],
    ["speakTts", "gnocchi", { rate: 0.82 }]
  ]);
});

test("builds dependency bundles from platform adapters", () => {
  const platform = createBackgroundPlatformAdapters({}, {});
  const playback = createPlaybackSurfacePlatformDependencies(platform);
  const runtime = createRuntimeAdapterPlatformDependencies(platform);

  assert.equal(playback.offscreenAudioUrl, BACKGROUND_OFFSCREEN_AUDIO_URL);
  assert.equal(playback.storageKeys, BACKGROUND_STORAGE_KEYS);
  assert.equal(runtime.storageKeys, BACKGROUND_STORAGE_KEYS);
  assert.equal(runtime.getRuntimeUrl("x"), "x");
  assert.deepEqual(platform.matchClients(), []);
  assert.equal(platform.hasOffscreenDocument, null);
});

test("reports TTS adapter errors", async () => {
  const platform = createBackgroundPlatformAdapters({
    tts: {
      speak: async () => {
        throw new Error("Speech engine refused the utterance");
      }
    }
  }, {});

  assert.deepEqual(await platform.speakTts("Example", { lang: "en-US" }), {
    ok: false,
    error: "Speech engine refused the utterance"
  });
});
