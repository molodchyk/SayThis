import {
  getBestAudio,
  normalizeSelection,
  resultToSpeechOptions
} from "./resolver-core.js";
import {
  contextMenuDefinitions,
  resolveOptionsForMenuId
} from "./extension-actions.js";
import {
  createOffscreenPlayAudioMessage,
  createOffscreenStopAudioMessage,
  createShowResultMessage
} from "./message-contracts.js";
import {
  normalizeSettings
} from "./shared/settings.js";
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
  playAudioOffscreen as playAudioOffscreenFlow,
  playResolvedResult as playResolvedResultFlow
} from "./background/result-playback-flow.js";
import {
  resolveSelection as resolveSelectionFlow
} from "./background/selection-resolver-flow.js";
import {
  flushCommunitySync as flushCommunitySyncFlow,
  pullApprovedCommunityEntries as pullApprovedCommunityEntriesFlow,
  saveFeedback as saveFeedbackFlow
} from "./background/community-feedback-flow.js";

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
let seedPromise;
let offscreenCreatePromise;

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
    }, activeSelectionDependencies());
  }

  if (command === "pronounce-selection-online") {
    handleActiveSelectionCommand({
      source: "keyboard-online",
      useOnline: true
    }, activeSelectionDependencies());
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
  handleRuntimeMessage(message, sendResponse, runtimeMessageDependencies()));

async function resolveSelection(text, options = {}) {
  return resolveSelectionFlow(text, options, {
    getStorage: (keys) => chrome.storage.local.get(keys),
    setStorage: (value) => chrome.storage.local.set(value),
    loadSeedData,
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

async function loadSeedData() {
  if (!seedPromise) {
    seedPromise = fetch(chrome.runtime.getURL("data/pronunciation-seed.json")).then((response) => response.json());
  }

  return seedPromise;
}

function speakResult(result, overrides = {}) {
  const speech = resultToSpeechOptions(result, overrides);
  if (!speech.text) {
    return;
  }

  chrome.tts.stop();
  chrome.tts.speak(speech.text, speech.options);
}

function speakFallback(text) {
  chrome.tts.stop();
  chrome.tts.speak(text, {
    enqueue: false,
    rate: 0.82
  });
}

async function readSelectionFromTab(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection()?.toString() || ""
    });

    return normalizeSelection(result?.result);
  } catch {
    return "";
  }
}

function activeSelectionDependencies() {
  return {
    getActiveTab: async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab;
    },
    readSelectionFromTab,
    setStorage: (value) => chrome.storage.local.set(value),
    resolveSelection,
    playResolvedResult,
    speakFallback,
    lastSelectionKey: STORAGE_KEYS.lastSelection,
    lastSourceKey: STORAGE_KEYS.lastSource
  };
}

async function playResolvedResult(result, tabId) {
  return playResolvedResultFlow(result, tabId, {
    getBestAudio,
    showResultOnTab,
    playAudioOffscreen,
    speakResult
  });
}

async function playAudioOffscreen(result, rate = 0.82) {
  return playAudioOffscreenFlow(result, {
    getBestAudio,
    hasOffscreenAudioSupport: () => Boolean(chrome.offscreen),
    ensureOffscreenAudioDocument,
    sendOffscreenPlayAudioMessage: (audio, playbackRate) =>
      chrome.runtime.sendMessage(createOffscreenPlayAudioMessage(audio, playbackRate))
  }, rate);
}

async function stopOffscreenAudio() {
  if (!chrome.offscreen) {
    return;
  }

  try {
    await chrome.runtime.sendMessage(createOffscreenStopAudioMessage());
  } catch {
    // The offscreen document may not exist yet.
  }
}

async function stopPlayback() {
  chrome.tts.stop();
  await stopOffscreenAudio();
}

async function ensureOffscreenAudioDocument() {
  if (await hasOffscreenAudioDocument()) {
    return;
  }

  if (!offscreenCreatePromise) {
    offscreenCreatePromise = chrome.offscreen.createDocument({
      url: OFFSCREEN_AUDIO_URL,
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play pronunciation audio when a page overlay is unavailable."
    }).finally(() => {
      offscreenCreatePromise = null;
    });
  }

  await offscreenCreatePromise;
}

async function hasOffscreenAudioDocument() {
  if (typeof chrome.offscreen.hasDocument === "function") {
    return chrome.offscreen.hasDocument();
  }

  if (typeof clients === "undefined" || typeof clients.matchAll !== "function") {
    return false;
  }

  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_AUDIO_URL);
  const matchedClients = await clients.matchAll();
  return matchedClients.some((client) => client.url === offscreenUrl);
}

async function showResultOnTab(tabId, result, options = {}) {
  if (!tabId || !result) {
    return false;
  }

  try {
    const settings = await getSettings();
    if (!settings.showOverlay) {
      return false;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content/overlay-style.js", "src/content-overlay.js"]
    });
    await chrome.tabs.sendMessage(tabId, createShowResultMessage(result, {
      autoPlay: Boolean(options.autoPlay)
    }));
    return true;
  } catch {
    // Some pages do not allow extension script injection.
    return false;
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.settings]);
  return normalizeSettings(stored[STORAGE_KEYS.settings]);
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
