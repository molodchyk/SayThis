import {
  normalizeSelection
} from "../resolver-core.js";
import {
  normalizeLanguageHints
} from "../shared/settings.js";

const DEFAULT_POPUP_SETTINGS = {
  autoSpeakPopup: true
};
const POPUP_STATE_KEYS = {
  lastResult: "lastResult",
  lastSelection: "lastSelection",
  lastSource: "lastSource"
};

export function createPopupRuntimeAdapters(runtime = globalThis.chrome) {
  return {
    getStorage: (keys) => runtime?.storage?.local?.get(keys),
    setStorage: (value) => runtime?.storage?.local?.set(value),
    queryTabs: (query) => runtime?.tabs?.query(query),
    executeScript: (details) => runtime?.scripting?.executeScript(details),
    sendMessage: (message, callback) => runtime?.runtime?.sendMessage(message, callback),
    openOptionsPage: (callback) => runtime?.runtime?.openOptionsPage(callback),
    lastError: () => runtime?.runtime?.lastError
  };
}

export async function readActiveTabSelection(dependencies = {}) {
  try {
    const tabs = await dependencies.queryTabs?.({
      active: true,
      currentWindow: true
    });
    const tab = tabs?.[0];
    if (!tab?.id) {
      return "";
    }

    const [result] = await dependencies.executeScript?.({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() || ""
    });

    return normalizeSelection(result?.result);
  } catch {
    return "";
  }
}

export async function readPopupSettings(dependencies = {}) {
  const stored = await dependencies.getStorage?.(["settings"]);
  return {
    ...DEFAULT_POPUP_SETTINGS,
    ...(stored?.settings || {}),
    autoSpeakPopup: stored?.settings?.autoSpeakPopup !== false
  };
}

export async function writeActiveTabPopupState(selection, dependencies = {}) {
  const normalized = normalizeSelection(selection);
  if (!normalized) {
    return;
  }

  await dependencies.setStorage?.({
    [POPUP_STATE_KEYS.lastSelection]: normalized,
    [POPUP_STATE_KEYS.lastSource]: "active-tab"
  });
}

export async function readStoredPopupState(dependencies = {}) {
  const stored = await dependencies.getStorage?.([
    POPUP_STATE_KEYS.lastSelection,
    POPUP_STATE_KEYS.lastResult
  ]);
  return {
    lastSelection: normalizeSelection(stored?.[POPUP_STATE_KEYS.lastSelection]),
    lastResult: isPlainObject(stored?.[POPUP_STATE_KEYS.lastResult])
      ? stored[POPUP_STATE_KEYS.lastResult]
      : null
  };
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

export function openExtensionOptions(dependencies = {}) {
  return new Promise((resolve) => {
    if (typeof dependencies.openOptionsPage !== "function") {
      resolve({ ok: false, error: "Options unavailable." });
      return;
    }

    try {
      const maybePromise = dependencies.openOptionsPage(() => {
        const lastError = dependencies.lastError?.();
        if (lastError) {
          resolve({ ok: false, error: lastError.message || String(lastError) });
          return;
        }

        resolve({ ok: true });
      });
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise
          .then(() => resolve({ ok: true }))
          .catch((error) => resolve({ ok: false, error: error?.message || "Options unavailable." }));
      }
    } catch (error) {
      resolve({ ok: false, error: error?.message || "Options unavailable." });
    }
  });
}

export function lookupHintsFromValue(value) {
  return normalizeLanguageHints(value);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
