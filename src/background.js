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
  handleActiveSelectionCommandName
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
  requestSharedAudioForResult as requestSharedAudioForResultFlow,
  saveFeedback as saveFeedbackFlow
} from "./background/community-feedback-flow.js";
import {
  createPlaybackSurface
} from "./background/playback-surface-flow.js";
import {
  createRuntimeAdapters
} from "./background/runtime-adapters-flow.js";
import {
  BACKGROUND_STORAGE_KEYS as STORAGE_KEYS,
  createBackgroundPlatformAdapters,
  createPlaybackSurfacePlatformDependencies,
  createRuntimeAdapterPlatformDependencies
} from "./background/runtime-platform.js";

const platform = createBackgroundPlatformAdapters();
const playbackSurface = createPlaybackSurface(createPlaybackSurfacePlatformDependencies(platform, STORAGE_KEYS));
const runtimeAdapters = createRuntimeAdapters(createRuntimeAdapterPlatformDependencies(platform, STORAGE_KEYS));

platform.addInstalledListener(() => {
  for (const item of contextMenuDefinitions()) {
    platform.createContextMenu(item);
  }
});

platform.addContextMenuClickedListener((info, tab) => {
  handleContextMenuClick(info, tab, {
    resolveOptionsForMenuId,
    normalizeSelection,
    setStorage: platform.setStorage,
    resolveSelection,
    requestSharedAudio,
    playResolvedResult,
    lastResultKey: STORAGE_KEYS.lastResult
  });
});

platform.addCommandListener((command) => {
  handleActiveSelectionCommandName(command, runtimeAdapters.activeSelectionDependencies({
    resolveSelection,
    requestSharedAudio,
    playResolvedResult
  }));
});

platform.addMessageListener((message, _sender, sendResponse) => handleRuntimeMessage(message, sendResponse, runtimeMessageDependencies()));

async function resolveSelection(text, options = {}) {
  return resolveSelectionFlow(text, options, {
    getStorage: platform.getStorage,
    setStorage: platform.setStorage,
    loadSeedData: runtimeAdapters.loadSeedData,
    getRuntimeUrl: platform.getRuntimeUrl,
    storageKeys: STORAGE_KEYS
  });
}

async function saveFeedback(text, feedback) {
  return saveFeedbackFlow(text, feedback, {
    getStorage: platform.getStorage,
    setStorage: platform.setStorage,
    resolveSelection,
    flushCommunitySync,
    storageKeys: STORAGE_KEYS
  });
}

async function flushCommunitySync() {
  return flushCommunitySyncFlow({
    getStorage: platform.getStorage,
    setStorage: platform.setStorage,
    storageKeys: STORAGE_KEYS
  });
}

async function pullApprovedCommunityEntries() {
  return pullApprovedCommunityEntriesFlow({
    getStorage: platform.getStorage,
    setStorage: platform.setStorage,
    storageKeys: STORAGE_KEYS
  });
}

async function requestSharedAudio(text, result, options = {}) {
  return requestSharedAudioForResultFlow(text, result, options, {
    getStorage: platform.getStorage,
    setStorage: platform.setStorage,
    fetch: platform.fetch,
    resolveSelection,
    storageKeys: STORAGE_KEYS
  });
}

function speakResult(result, overrides = {}) {
  return playbackSurface.speakResult(result, overrides);
}

function playAudio(audio, rate) {
  return playbackSurface.playAudioItemOffscreen(audio, rate);
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
    playAudio,
    stopPlayback,
    saveFeedback,
    flushCommunitySync,
    pullApprovedCommunityEntries,
    requestSharedAudio
  };
}
