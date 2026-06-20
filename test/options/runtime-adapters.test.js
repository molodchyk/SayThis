import assert from "node:assert/strict";
import test from "node:test";
import {
  createOptionsRuntimeAdapters,
  OPTIONS_STORAGE_KEYS,
  readOptionsStorage,
  removeUnusedRemotePermissions,
  requestEndpointPermission,
  requestEndpointPermissionFromUserGesture,
  sendRuntimeMessage,
  writeOptionsStorage
} from "../../src/options/runtime-adapters.js";
import {
  DEFAULT_COMMUNITY_ENDPOINT
} from "../../src/community-sync.js";

test("defines the options storage keys used by the extension page", () => {
  assert.deepEqual(Object.keys(OPTIONS_STORAGE_KEYS).sort(), [
    "approvedCommunityEntries",
    "communityEntries",
    "communityPullState",
    "credentials",
    "resultCache",
    "settings",
    "syncQueue",
    "syncSummary"
  ]);
});

test("creates adapters for storage, permissions, and runtime messages", async () => {
  const calls = [];
  const chromeApi = {
    storage: {
      local: {
        get: async (keys) => {
          calls.push(["get", keys]);
          return { settings: { onlineByDefault: true } };
        },
        set: async (value) => {
          calls.push(["set", value]);
        }
      }
    },
    permissions: {
      contains: async (value) => {
        calls.push(["contains", value]);
        return false;
      },
      request: async (value) => {
        calls.push(["request", value]);
        return true;
      },
      remove: async (value) => {
        calls.push(["remove", value]);
        return true;
      }
    },
    runtime: {
      lastError: null,
      sendMessage: (message, respond) => {
        calls.push(["sendMessage", message]);
        respond({ ok: true });
      }
    }
  };
  const adapters = createOptionsRuntimeAdapters(chromeApi);

  assert.deepEqual(await readOptionsStorage(["settings"], adapters), {
    settings: { onlineByDefault: true }
  });
  await writeOptionsStorage({ settings: {} }, adapters);
  assert.equal(await requestEndpointPermission("https://example.com/search", adapters), true);
  assert.deepEqual(await sendRuntimeMessage({ type: "SAYTHIS_FLUSH_SYNC" }, adapters), { ok: true });
  await adapters.removePermission("https://example.com/*");

  assert.deepEqual(calls, [
    ["get", ["settings"]],
    ["set", { settings: {} }],
    ["contains", { origins: ["https://example.com/*"] }],
    ["request", { origins: ["https://example.com/*"] }],
    ["sendMessage", { type: "SAYTHIS_FLUSH_SYNC" }],
    ["remove", { origins: ["https://example.com/*"] }]
  ]);
});

test("storage helpers tolerate missing adapters", async () => {
  assert.deepEqual(await readOptionsStorage(["settings"]), {});
  await writeOptionsStorage({ settings: {} });
});

test("requests endpoint permissions conservatively", async () => {
  assert.equal(await requestEndpointPermission("not-a-url"), false);
  assert.equal(await requestEndpointPermission("https://example.com/search"), true);
  assert.equal(await requestEndpointPermission(DEFAULT_COMMUNITY_ENDPOINT, {
    containsPermission: async () => {
      throw new Error("required hosted endpoint should not need contains");
    },
    requestPermission: async () => {
      throw new Error("required hosted endpoint should not request optional permission");
    }
  }), true);

  assert.equal(await requestEndpointPermission("https://example.com/search", {
    containsPermission: async () => true,
    requestPermission: async () => {
      throw new Error("should not request already-granted origins");
    }
  }), true);

  const requested = [];
  assert.equal(await requestEndpointPermission("https://example.com/search", {
    containsPermission: async (origin) => {
      requested.push(["contains", origin]);
      return false;
    },
    requestPermission: async (origin) => {
      requested.push(["request", origin]);
      return false;
    }
  }), false);
  assert.deepEqual(requested, [
    ["contains", "https://example.com/*"],
    ["request", "https://example.com/*"]
  ]);
});

test("can request endpoint permission directly from a user gesture", async () => {
  const calls = [];
  assert.equal(await requestEndpointPermissionFromUserGesture(DEFAULT_COMMUNITY_ENDPOINT, {
    containsPermission: async () => {
      throw new Error("required hosted endpoint should not need contains");
    },
    requestPermission: async () => {
      throw new Error("required hosted endpoint should not request optional permission");
    }
  }), true);

  assert.equal(await requestEndpointPermissionFromUserGesture("http://127.0.0.1:8787/community", {
    containsPermission: async () => {
      throw new Error("direct gesture request should not wait on contains");
    },
    requestPermission: async (origin) => {
      calls.push(origin);
      return true;
    }
  }), true);

  assert.deepEqual(calls, ["http://127.0.0.1/*"]);
});

test("removes stale optional remote permissions best-effort", async () => {
  const removed = [];
  await removeUnusedRemotePermissions({
    customSourceEnabled: true,
    customSourceEndpoint: "https://old.example/search",
    dbpediaEnabled: true,
    dbpediaEndpoint: "https://keep.example/search"
  }, {
    customSourceEnabled: true,
    customSourceEndpoint: "https://new.example/search",
    dbpediaEnabled: true,
    dbpediaEndpoint: "https://keep.example/search"
  }, {}, {}, {
    removePermission: async (origin) => {
      removed.push(origin);
      throw new Error("cleanup failure should be ignored");
    }
  });

  assert.deepEqual(removed, ["https://old.example/*"]);
});

test("sends runtime messages with error normalization", async () => {
  assert.deepEqual(await sendRuntimeMessage({ type: "SAYTHIS_PULL_APPROVED" }, {
    sendMessage: (_message, respond) => respond({ ok: true, summary: { received: 1 } }),
    lastError: () => null
  }), { ok: true, summary: { received: 1 } });

  assert.deepEqual(await sendRuntimeMessage({ type: "SAYTHIS_PULL_APPROVED" }, {
    sendMessage: (_message, respond) => respond(undefined),
    lastError: () => ({ message: "No receiver" })
  }), { ok: false, error: "No receiver" });

  assert.deepEqual(await sendRuntimeMessage({ type: "SAYTHIS_PULL_APPROVED" }, {
    sendMessage: (_message, respond) => respond(undefined),
    lastError: () => null
  }), { ok: false, error: "No response." });

  assert.deepEqual(await sendRuntimeMessage({ type: "SAYTHIS_PULL_APPROVED" }), {
    ok: false,
    error: "Runtime messaging unavailable."
  });
});
