import {
  normalizeSelection
} from "./resolver-core.js";
import {
  contextMenuDefinitions,
  resolveOptionsForMenuId
} from "./extension-actions.js";
import {
  handleContextMenuClick
} from "./background/context-menu-flow.js";
import {
  handleActiveSelectionCommand
} from "./background/active-selection-flow.js";
import {
  handleRuntimeMessage
} from "./background/runtime-message-flow.js";
import {
  resolveSelection as resolveSelectionFlow
} from "./background/selection-resolver-flow.js";
import {
  flushCommunitySync as flushCommunitySyncFlow,
  pullApprovedCommunityEntries as pullApprovedCommunityEntriesFlow,
  saveFeedback as saveFeedbackFlow
} from "./background/community-feedback-flow.js";
import {
  createPlaybackSurface
} from "./background/playback-surface-flow.js";
import {
  createRuntimeAdapters
} from "./background/runtime-adapters-flow.js";

const OFFSCREEN_AUDIO_URL = "src/offscreen-audio.html";
const STORAGE_KEYS = {
  approvedCommunityEntries: "approvedCommunityEntries",
  communityEntries: "communityEntries",
  communityPullState: "communityPullState",
  credentials: "credentials",
  lastResult: "lastResult",
  lastSelection: "lastSelection",
  lastSource: "lastSource",
  resultCache: "resultCache",
  syncQueue: "syncQueue",
  syncSummary: "syncSummary",
  settings: "settings"
};
const playbackSurface = createPlaybackSurface({
  offscreenAudioUrl: OFFSCREEN_AUDIO_URL,
  getStorage: (keys) => chrome.storage.local.get(keys),
  stopTts: () => chrome.tts.stop(),
  speakTts: (text, options) => chrome.tts.speak(text, options),
  hasOffscreenAudioSupport: () => Boolean(chrome.offscreen),
  hasOffscreenDocument: typeof chrome.offscreen?.hasDocument === "function"
    ? () => chrome.offscreen.hasDocument()
    : null,
  createOffscreenDocument: (options) => chrome.offscreen.createDocument(options),
  sendRuntimeMessage: (message) => chrome.runtime.sendMessage(message),
  executeScript: (details) => chrome.scripting.executeScript(details),
  sendTabMessage: (tabId, message) => chrome.tabs.sendMessage(tabId, message),
  getRuntimeUrl: (url) => chrome.runtime.getURL(url),
  matchClients: () => typeof clients !== "undefined" && typeof clients.matchAll === "function"
    ? clients.matchAll()
    : [],
  storageKeys: STORAGE_KEYS
});
const runtimeAdapters = createRuntimeAdapters({
  getRuntimeUrl: (url) => chrome.runtime.getURL(url),
  fetch: (url) => fetch(url),
  queryTabs: (query) => chrome.tabs.query(query),
  executeScript: (details) => chrome.scripting.executeScript(details),
  setStorage: (value) => chrome.storage.local.set(value),
  storageKeys: STORAGE_KEYS
});

chrome.runtime.onInstalled.addListener(() => {
  for (const item of contextMenuDefinitions()) {
    chrome.contextMenus.create(item);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleContextMenuClick(info, tab, {
    resolveOptionsForMenuId,
    normalizeSelection,
    setStorage: (value) => chrome.storage.local.set(value),
    resolveSelection,
    playResolvedResult,
    speakFallback,
    lastResultKey: STORAGE_KEYS.lastResult
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "pronounce-selection") {
    handleActiveSelectionCommand({
      source: "keyboard"
    }, runtimeAdapters.activeSelectionDependencies({
      resolveSelection,
      playResolvedResult,
      speakFallback
    }));
  }

  if (command === "pronounce-selection-online") {
    handleActiveSelectionCommand({
      source: "keyboard-online",
      useOnline: true
    }, runtimeAdapters.activeSelectionDependencies({
      resolveSelection,
      playResolvedResult,
      speakFallback
    }));
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
  handleRuntimeMessage(message, sendResponse, runtimeMessageDependencies()));

async function resolveSelection(text, options = {}) {
  return resolveSelectionFlow(text, options, {
    getStorage: (keys) => chrome.storage.local.get(keys),
    setStorage: (value) => chrome.storage.local.set(value),
    loadSeedData: runtimeAdapters.loadSeedData,
    getRuntimeUrl: (url) => chrome.runtime.getURL(url),
    storageKeys: STORAGE_KEYS
  });
}

async function saveFeedback(text, feedback) {
  return saveFeedbackFlow(text, feedback, {
    getStorage: (keys) => chrome.storage.local.get(keys),
    setStorage: (value) => chrome.storage.local.set(value),
    resolveSelection,
    flushCommunitySync,
    storageKeys: STORAGE_KEYS
  });
}

async function flushCommunitySync() {
  return flushCommunitySyncFlow({
    getStorage: (keys) => chrome.storage.local.get(keys),
    setStorage: (value) => chrome.storage.local.set(value),
    storageKeys: STORAGE_KEYS
  });
}

async function pullApprovedCommunityEntries() {
  return pullApprovedCommunityEntriesFlow({
    getStorage: (keys) => chrome.storage.local.get(keys),
    setStorage: (value) => chrome.storage.local.set(value),
    storageKeys: STORAGE_KEYS
  });
}

function speakResult(result, overrides = {}) {
  return playbackSurface.speakResult(result, overrides);
}

function speakFallback(text) {
  return playbackSurface.speakFallback(text);
}

async function playResolvedResult(result, tabId) {
  return playbackSurface.playResolvedResult(result, tabId);
}

async function stopPlayback() {
  return playbackSurface.stopPlayback();
}

function runtimeMessageDependencies() {
  return {
    resolveSelection,
    speakResult,
    stopPlayback,
    saveFeedback,
    flushCommunitySync,
    pullApprovedCommunityEntries
  };
}
