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
    createTab: (details) => runtime?.tabs?.create?.(details),
    executeScript: (details) => runtime?.scripting?.executeScript(details),
    getRuntimeUrl: (path) => runtime?.runtime?.getURL?.(path),
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

    const results = await dependencies.executeScript?.({
      target: { tabId: tab.id, allFrames: true },
      func: () => {
        const element = document.activeElement;
        const tagName = String(element?.tagName || "").toLowerCase();
        const type = String(element?.type || "text").toLowerCase();
        const isTextControl = tagName === "textarea" ||
          (tagName === "input" && ["", "email", "search", "tel", "text", "url"].includes(type));

        if (isTextControl) {
          const start = Number(element.selectionStart);
          const end = Number(element.selectionEnd);
          if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            return String(element.value || "").slice(start, end);
          }
        }

        return window.getSelection()?.toString() || "";
      }
    });

    return firstNormalizedSelection(results);
  } catch {
    return "";
  }
}

function firstNormalizedSelection(results = []) {
  return (Array.isArray(results) ? results : [])
    .map((item) => normalizeSelection(item?.result))
    .find(Boolean) || "";
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

export function openExtensionOptions(dependencies = {}, options = {}) {
  return new Promise((resolve) => {
    const pageHash = normalizePageHash(options.pageHash);
    if (
      pageHash &&
      typeof dependencies.getRuntimeUrl === "function" &&
      typeof dependencies.createTab === "function"
    ) {
      try {
        const maybePromise = dependencies.createTab({
          url: dependencies.getRuntimeUrl(`src/options/options.html#${pageHash}`)
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise
            .then(() => resolve({ ok: true }))
            .catch((error) => resolve({ ok: false, error: error?.message || "Options unavailable." }));
          return;
        }

        resolve({ ok: true });
      } catch (error) {
        resolve({ ok: false, error: error?.message || "Options unavailable." });
      }
      return;
    }

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

function normalizePageHash(value) {
  return String(value || "")
    .trim()
    .replace(/^#/, "")
    .match(/^[a-z0-9-]{1,40}$/i)?.[0] || "";
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
