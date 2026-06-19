import {
  endpointOriginPattern
} from "../community-sync.js";
import {
  staleRemotePermissionOrigins
} from "../permission-origins.js";

export const OPTIONS_STORAGE_KEYS = {
  approvedCommunityEntries: "approvedCommunityEntries",
  communityEntries: "communityEntries",
  communityPullState: "communityPullState",
  credentials: "credentials",
  resultCache: "resultCache",
  syncQueue: "syncQueue",
  syncSummary: "syncSummary",
  settings: "settings"
};

export function createOptionsRuntimeAdapters(chromeApi = globalThis.chrome) {
  const storage = chromeApi?.storage?.local;
  const permissions = chromeApi?.permissions;
  const runtime = chromeApi?.runtime;

  return {
    getStorage: (keys) => storage?.get?.(keys) || Promise.resolve({}),
    setStorage: (value) => storage?.set?.(value) || Promise.resolve(),
    containsPermission: typeof permissions?.contains === "function"
      ? (origin) => permissions.contains({ origins: [origin] })
      : null,
    requestPermission: typeof permissions?.request === "function"
      ? (origin) => permissions.request({ origins: [origin] })
      : null,
    removePermission: typeof permissions?.remove === "function"
      ? (origin) => permissions.remove({ origins: [origin] })
      : null,
    sendMessage: typeof runtime?.sendMessage === "function"
      ? (message, callback) => runtime.sendMessage(message, callback)
      : null,
    lastError: () => runtime?.lastError
  };
}

export async function readOptionsStorage(keys, dependencies = {}) {
  return await dependencies.getStorage?.(keys) || {};
}

export async function writeOptionsStorage(value, dependencies = {}) {
  await dependencies.setStorage?.(value);
}

export async function requestEndpointPermission(endpoint, dependencies = {}) {
  const origin = endpointOriginPattern(endpoint);
  if (!origin) {
    return false;
  }

  if (typeof dependencies.containsPermission !== "function" &&
      typeof dependencies.requestPermission !== "function") {
    return true;
  }

  if (typeof dependencies.containsPermission === "function" &&
      await dependencies.containsPermission(origin)) {
    return true;
  }

  if (typeof dependencies.requestPermission !== "function") {
    return true;
  }

  return Boolean(await dependencies.requestPermission(origin));
}

export async function requestEndpointPermissionFromUserGesture(endpoint, dependencies = {}) {
  const origin = endpointOriginPattern(endpoint);
  if (!origin) {
    return false;
  }

  if (typeof dependencies.requestPermission === "function") {
    return Boolean(await dependencies.requestPermission(origin));
  }

  if (typeof dependencies.containsPermission === "function") {
    return Boolean(await dependencies.containsPermission(origin));
  }

  return true;
}

export async function removeUnusedRemotePermissions(previousSettings, nextSettings, previousCredentials, nextCredentials, dependencies = {}) {
  if (typeof dependencies.removePermission !== "function") {
    return;
  }

  for (const origin of staleRemotePermissionOrigins(previousSettings, nextSettings, previousCredentials, nextCredentials)) {
    try {
      await dependencies.removePermission(origin);
    } catch {
      // Permission cleanup is best-effort; saving settings should still finish.
    }
  }
}

export function sendRuntimeMessage(message, dependencies = {}) {
  return new Promise((resolve) => {
    if (typeof dependencies.sendMessage !== "function") {
      resolve({ ok: false, error: "Runtime messaging unavailable." });
      return;
    }

    dependencies.sendMessage(message, (response) => {
      const lastError = dependencies.lastError?.();
      if (lastError) {
        resolve({ ok: false, error: lastError.message || String(lastError) });
        return;
      }

      resolve(response || { ok: false, error: "No response." });
    });
  });
}
