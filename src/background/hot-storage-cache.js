export function createHotStorageCache(dependencies = {}, options = {}) {
  const cacheableKeys = new Set((options.keys || []).filter(Boolean));
  const cache = {};
  const knownKeys = new Set();
  const storageArea = options.areaName || "local";

  return {
    getStorage,
    setStorage,
    applyStorageChanges,
    clear
  };

  async function getStorage(keys) {
    const requestedKeys = normalizeRequestedKeys(keys);
    if (!requestedKeys || !cacheableKeys.size) {
      return dependencies.getStorage?.(keys) || {};
    }

    const missingKeys = requestedKeys.filter((key) => cacheableKeys.has(key) && !knownKeys.has(key));
    const passthroughKeys = requestedKeys.filter((key) => !cacheableKeys.has(key));
    const fetched = (missingKeys.length || passthroughKeys.length)
      ? await dependencies.getStorage?.([...missingKeys, ...passthroughKeys]) || {}
      : {};

    for (const key of missingKeys) {
      cache[key] = fetched[key];
      knownKeys.add(key);
    }

    return Object.fromEntries(requestedKeys.map((key) => [
      key,
      cacheableKeys.has(key) && knownKeys.has(key) ? cache[key] : fetched[key]
    ]));
  }

  function setStorage(value = {}) {
    if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (cacheableKeys.has(key)) {
          cache[key] = item;
          knownKeys.add(key);
        }
      }
    }

    return dependencies.setStorage?.(value);
  }

  function applyStorageChanges(changes = {}, areaName = storageArea) {
    if (areaName !== storageArea || !changes || typeof changes !== "object") {
      return;
    }

    for (const [key, change] of Object.entries(changes)) {
      if (!cacheableKeys.has(key)) {
        continue;
      }

      cache[key] = change?.newValue;
      knownKeys.add(key);
    }
  }

  function clear() {
    for (const key of Object.keys(cache)) {
      delete cache[key];
    }
    knownKeys.clear();
  }
}

function normalizeRequestedKeys(keys) {
  if (typeof keys === "string") {
    return [keys];
  }

  if (Array.isArray(keys)) {
    return [...new Set(keys.filter((key) => typeof key === "string" && key))];
  }

  return null;
}
