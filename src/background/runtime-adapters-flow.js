import {
  normalizeSelection
} from "../resolver-core.js";

const DEFAULT_SEED_DATA_URL = "data/pronunciation-seed.json";
const DEFAULT_STORAGE_KEYS = {
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
      playResolvedResult: workflows.playResolvedResult,
      showResultOnTab: workflows.showResultOnTab,
      recordDebugEvent: workflows.recordDebugEvent,
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
      const [result] = await dependencies.executeScript?.({
        target: { tabId },
        func: () => window.getSelection()?.toString() || ""
      });

      return normalizeSelection(result?.result);
    } catch {
      return "";
    }
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
