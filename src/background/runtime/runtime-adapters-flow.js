import {
  normalizeSelection
} from "../../resolver-core.js";

const DEFAULT_SEED_DATA_URL = "data/pronunciation-seed.json";
const DEFAULT_STORAGE_KEYS = {
  lastResult: "lastResult",
  lastSelection: "lastSelection",
  lastSource: "lastSource"
};

export function createRuntimeAdapters(dependencies = {}) {
  const seedDataUrl = dependencies.seedDataUrl || DEFAULT_SEED_DATA_URL;
  const storageKeys = {
    ...DEFAULT_STORAGE_KEYS,
    ...(dependencies.storageKeys || {})
  };
  let seedPromise = null;

  return {
    activeSelectionDependencies,
    getActiveTab,
    loadSeedData,
    readSelectionFromTab
  };

  function activeSelectionDependencies(workflows = {}) {
    return {
      getActiveTab,
      readSelectionFromTab,
      getStorage: dependencies.getStorage,
      setStorage: dependencies.setStorage,
      resolveSelection: workflows.resolveSelection,
      requestSharedAudio: workflows.requestSharedAudio,
      preparePlayback: workflows.preparePlayback,
      playResolvedResult: workflows.playResolvedResult,
      showResultOnTab: workflows.showResultOnTab,
      recordDebugEvent: workflows.recordDebugEvent,
      lastResultKey: storageKeys.lastResult,
      lastSelectionKey: storageKeys.lastSelection,
      lastSourceKey: storageKeys.lastSource
    };
  }

  async function getActiveTab() {
    if (typeof dependencies.getActiveTab === "function") {
      return dependencies.getActiveTab();
    }

    const tabs = await dependencies.queryTabs?.({
      active: true,
      currentWindow: true
    });
    return tabs?.[0] || null;
  }

  async function loadSeedData() {
    if (!seedPromise) {
      seedPromise = fetchJson(runtimeUrl(seedDataUrl));
    }

    return seedPromise;
  }

  async function readSelectionFromTab(tabId) {
    try {
      const results = await dependencies.executeScript?.({
        target: { tabId, allFrames: true },
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

  async function fetchJson(url) {
    if (typeof dependencies.fetchJson === "function") {
      return dependencies.fetchJson(url);
    }

    const response = await dependencies.fetch?.(url);
    return response?.json();
  }

  function runtimeUrl(url) {
    return typeof dependencies.getRuntimeUrl === "function"
      ? dependencies.getRuntimeUrl(url)
      : url;
  }
}
