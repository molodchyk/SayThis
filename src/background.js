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
  activateSelectionListenerOnOpenTabs,
  registerContextMenus
} from "./background/install-activation-flow.js";
import {
  buildDebugDiagnostics,
  summarizeAudioForDebug,
  summarizeResultForDebug,
  summarizeSpeechForDebug
} from "./background/debug-diagnostics-flow.js";
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
const playbackSurface = createPlaybackSurface({
  ...createPlaybackSurfacePlatformDependencies(platform, STORAGE_KEYS),
  onDebugEvent: recordPlaybackDebugEvent
});
const runtimeAdapters = createRuntimeAdapters(createRuntimeAdapterPlatformDependencies(platform, STORAGE_KEYS));
const debugEvents = [];

platform.addInstalledListener(() => {
  registerContextMenus(contextMenuDefinitions(), {
    createContextMenu: platform.createContextMenu
  });
  activateSelectionListenerOnOpenTabs(selectionActivationDependencies());
});

platform.addStartupListener(() => {
  activateSelectionListenerOnOpenTabs(selectionActivationDependencies());
});

platform.addContextMenuClickedListener((info, tab) => {
  handleContextMenuClick(info, tab, {
    resolveOptionsForMenuId,
    normalizeSelection,
    getStorage: platform.getStorage,
    setStorage: platform.setStorage,
    resolveSelection,
    requestSharedAudio,
    preparePlayback,
    playResolvedResult,
    showResultOnTab,
    recordDebugEvent,
    lastResultKey: STORAGE_KEYS.lastResult
  });
});

platform.addCommandListener((command) => {
  handleActiveSelectionCommandName(command, runtimeAdapters.activeSelectionDependencies({
    resolveSelection,
    requestSharedAudio,
    preparePlayback,
    playResolvedResult,
    showResultOnTab,
    recordDebugEvent
  }));
});

platform.addMessageListener((message, _sender, sendResponse) => handleRuntimeMessage(message, sendResponse, runtimeMessageDependencies()));

async function resolveSelection(text, options = {}) {
  const startedAt = Date.now();
  recordDebugEvent("resolve:start", {
    text: normalizeSelection(text),
    options: debugOptions(options),
    trace: options.trace
  });
  try {
    const result = await resolveSelectionFlow(text, options, {
      getStorage: platform.getStorage,
      setStorage: platform.setStorage,
      loadSeedData: runtimeAdapters.loadSeedData,
      getRuntimeUrl: platform.getRuntimeUrl,
      storageKeys: STORAGE_KEYS
    });
    recordDebugEvent("resolve:result", {
      elapsedMs: Date.now() - startedAt,
      result: summarizeResultForDebug(result),
      trace: options.trace
    });
    return result;
  } catch (error) {
    recordDebugEvent("resolve:error", {
      elapsedMs: Date.now() - startedAt,
      error: errorMessage(error),
      trace: options.trace
    });
    throw error;
  }
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
  const startedAt = Date.now();
  recordDebugEvent("shared-audio:start", {
    text: normalizeSelection(text),
    options: debugOptions(options),
    result: summarizeResultForDebug(result),
    trace: options.trace
  });
  try {
    const sharedResult = await requestSharedAudioForResultFlow(text, result, options, {
      getStorage: platform.getStorage,
      setStorage: platform.setStorage,
      fetch: platform.fetch,
      resolveSelection,
      storageKeys: STORAGE_KEYS
    });
    recordDebugEvent("shared-audio:result", {
      elapsedMs: Date.now() - startedAt,
      audio: summarizeAudioForDebug(getBestAudio(sharedResult)),
      result: summarizeResultForDebug(sharedResult),
      trace: options.trace
    });
    return sharedResult;
  } catch (error) {
    recordDebugEvent("shared-audio:error", {
      elapsedMs: Date.now() - startedAt,
      error: errorMessage(error),
      trace: options.trace
    });
    throw error;
  }
}

async function speakResult(result, overrides = {}) {
  const startedAt = Date.now();
  recordDebugEvent("speech:start", {
    overrides: debugOptions(overrides),
    plan: speechPlanSummary(result, overrides),
    result: summarizeResultForDebug(result),
    trace: overrides.trace
  });
  try {
    const speech = await playbackSurface.speakResult(result, overrides);
    recordDebugEvent("speech:result", {
      elapsedMs: Date.now() - startedAt,
      speech: summarizeSpeechForDebug(speech)
    });
    return speech;
  } catch (error) {
    recordDebugEvent("speech:error", {
      elapsedMs: Date.now() - startedAt,
      error: errorMessage(error)
    });
    throw error;
  }
}

async function playAudio(audio, rate, trace) {
  const startedAt = Date.now();
  recordDebugEvent("audio:start", {
    audio: summarizeAudioForDebug(audio),
    rate,
    trace
  });
  try {
    const played = await playbackSurface.playAudioItemOffscreen(audio, rate, trace);
    recordDebugEvent("audio:result", {
      elapsedMs: Date.now() - startedAt,
      played: Boolean(played),
      trace
    });
    return played;
  } catch (error) {
    recordDebugEvent("audio:error", {
      elapsedMs: Date.now() - startedAt,
      error: errorMessage(error)
    });
    throw error;
  }
}

async function playResolvedResult(result, tabId, trace) {
  return playbackSurface.playResolvedResult(result, tabId, trace);
}

async function showResultOnTab(tabId, result, options = {}) {
  return playbackSurface.showResultOnTab(tabId, result, options);
}

async function stopPlayback() {
  return playbackSurface.stopPlayback();
}

async function preparePlayback(trace) {
  if (!platform.hasOffscreenAudioSupport?.()) {
    return false;
  }

  const startedAt = Date.now();
  recordDebugEvent("audio-prepare:start", {
    trace
  });
  try {
    await playbackSurface.ensureOffscreenAudioDocument();
    recordDebugEvent("audio-prepare:result", {
      elapsedMs: Date.now() - startedAt,
      trace
    });
    return true;
  } catch (error) {
    recordDebugEvent("audio-prepare:error", {
      elapsedMs: Date.now() - startedAt,
      error: errorMessage(error),
      trace
    });
    return false;
  }
}

async function getDebugState() {
  return buildDebugDiagnostics({
    getStorage: platform.getStorage,
    getTtsVoices: platform.getTtsVoices,
    getManifest: platform.getManifest,
    getOffscreenDebugState: playbackSurface.getOffscreenDebugState,
    getDebugEvents: () => debugEvents,
    storageKeys: STORAGE_KEYS
  });
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
    requestSharedAudio,
    preparePlayback,
    getStorage: platform.getStorage,
    getDebugState,
    recordDebugEvent
  };
}

function selectionActivationDependencies() {
  return {
    queryTabs: platform.queryTabs,
    executeScript: platform.executeScript,
    recordDebugEvent
  };
}

function recordDebugEvent(kind, payload = {}) {
  const now = Date.now();
  const trace = normalizeDebugTrace(payload.trace);
  debugEvents.push({
    at: new Date(now).toISOString(),
    kind,
    ...payload,
    ...(trace ? {
      trace,
      sinceTraceStartMs: Math.max(0, now - trace.startedAt)
    } : {})
  });
  while (debugEvents.length > 60) {
    debugEvents.shift();
  }
}

function recordPlaybackDebugEvent(kind, payload = {}) {
  recordDebugEvent(kind, payload);
}

function speechPlanSummary(result, overrides = {}) {
  try {
    const speech = resultToSpeechOptions(result, overrides);
    return {
      text: speech.text,
      lang: speech.options?.lang || "",
      rate: speech.options?.rate
    };
  } catch {
    return null;
  }
}

function debugOptions(options = {}) {
  return {
    useOnline: Object.prototype.hasOwnProperty.call(options, "useOnline")
      ? Boolean(options.useOnline)
      : undefined,
    skipSharedAudio: Boolean(options.skipSharedAudio),
    rate: options.rate,
    lang: options.lang,
    languageHints: Array.isArray(options.languageHints) ? options.languageHints : undefined,
    trace: normalizeDebugTrace(options.trace)
  };
}

function errorMessage(error) {
  return error?.message || String(error || "Unknown error");
}

function normalizeDebugTrace(value = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = normalizeSelection(value.id).slice(0, 80);
  const startedAt = Number(value.startedAt);
  if (!id || !Number.isFinite(startedAt)) {
    return null;
  }

  return {
    id,
    source: normalizeSelection(value.source).slice(0, 32),
    action: normalizeSelection(value.action).slice(0, 48),
    startedAt
  };
}
