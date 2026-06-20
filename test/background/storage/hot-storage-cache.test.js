import assert from "node:assert/strict";
import test from "node:test";
import {
  createHotStorageCache
} from "../../../src/background/storage/hot-storage-cache.js";

test("reuses cached hot storage keys without another storage read", async () => {
  const calls = [];
  const state = {
    approvedCommunityEntries: { example: { lookupKey: "example" } },
    settings: { communityAudioEnabled: true }
  };
  const cache = createHotStorageCache({
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return Object.fromEntries(keys.map((key) => [key, state[key]]));
    }
  }, {
    keys: ["approvedCommunityEntries", "settings"]
  });

  assert.deepEqual(await cache.getStorage(["approvedCommunityEntries", "settings"]), state);
  assert.deepEqual(await cache.getStorage(["approvedCommunityEntries", "settings"]), state);
  assert.deepEqual(calls, [
    ["getStorage", ["approvedCommunityEntries", "settings"]]
  ]);
});

test("passes uncached keys through while keeping hot keys in memory", async () => {
  const calls = [];
  const cache = createHotStorageCache({
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return {
        approvedCommunityEntries: { example: { lookupKey: "example" } },
        credentials: { token: "redacted" }
      };
    }
  }, {
    keys: ["approvedCommunityEntries"]
  });

  assert.deepEqual(await cache.getStorage(["approvedCommunityEntries", "credentials"]), {
    approvedCommunityEntries: { example: { lookupKey: "example" } },
    credentials: { token: "redacted" }
  });
  assert.deepEqual(await cache.getStorage(["approvedCommunityEntries", "credentials"]), {
    approvedCommunityEntries: { example: { lookupKey: "example" } },
    credentials: { token: "redacted" }
  });
  assert.deepEqual(calls, [
    ["getStorage", ["approvedCommunityEntries", "credentials"]],
    ["getStorage", ["credentials"]]
  ]);
});

test("updates hot cache from writes and storage change events", async () => {
  const calls = [];
  const cache = createHotStorageCache({
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return { settings: { communityAudioEnabled: true } };
    },
    setStorage: async (value) => calls.push(["setStorage", value])
  }, {
    keys: ["settings"]
  });

  assert.deepEqual(await cache.getStorage(["settings"]), {
    settings: { communityAudioEnabled: true }
  });
  await cache.setStorage({ settings: { communityAudioEnabled: false } });
  assert.deepEqual(await cache.getStorage(["settings"]), {
    settings: { communityAudioEnabled: false }
  });
  cache.applyStorageChanges({
    settings: {
      oldValue: { communityAudioEnabled: false },
      newValue: { communityAudioEnabled: true }
    }
  }, "local");
  assert.deepEqual(await cache.getStorage(["settings"]), {
    settings: { communityAudioEnabled: true }
  });
  assert.deepEqual(calls, [
    ["getStorage", ["settings"]],
    ["setStorage", { settings: { communityAudioEnabled: false } }]
  ]);
});

test("bypasses non-keyed storage reads", async () => {
  const calls = [];
  const cache = createHotStorageCache({
    getStorage: async (keys) => {
      calls.push(["getStorage", keys]);
      return { settings: {} };
    }
  }, {
    keys: ["settings"]
  });

  assert.deepEqual(await cache.getStorage(null), { settings: {} });
  assert.deepEqual(calls, [["getStorage", null]]);
});
