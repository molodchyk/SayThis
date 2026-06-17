import {
  normalizeSelection
} from "../resolver-core.js";
import {
  normalizeLanguageHints
} from "../shared/settings.js";

const DEFAULT_POPUP_SETTINGS = {
  autoSpeakPopup: true
};

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

export function lookupHintsFromValue(value) {
  return normalizeLanguageHints(value);
}
