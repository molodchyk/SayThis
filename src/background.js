import {
  getBestAudio,
  normalizeSelection,
  resultToSpeechOptions
} from "./resolver-core.js";
import {
  createGetVisibleResultMessage
} from "./message-contracts.js";
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
  createHotStorageCache
} from "./background/hot-storage-cache.js";
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
const sharedAudioStorage = createHotStorageCache({
  getStorage: platform.getStorage,
  setStorage: platform.setStorage
}, {
  keys: [
    STORAGE_KEYS.approvedCommunityEntries,
    STORAGE_KEYS.settings
  ]
});
const playbackSurface = createPlaybackSurface({
  ...createPlaybackSurfacePlatformDependencies(platform, STORAGE_KEYS),
  onDebugEvent: recordPlaybackDebugEvent,
  preloadVisibleResultAudio: preloadSharedAudioForPlayback
});
const runtimeAdapters = createRuntimeAdapters(createRuntimeAdapterPlatformDependencies(platform, STORAGE_KEYS));
const debugEvents = [];
const DEBUG_EVENT_LIMIT = 180;
const APPROVED_SHARED_ENTRIES_SELECTION_REFRESH_MS = 15 * 60 * 1000;
const APPROVED_SHARED_ENTRIES_SELECTION_REFRESH_DELAY_MS = 1200;
let approvedSharedEntriesRefreshPromise = null;
let approvedSharedEntriesLastRefreshAt = 0;
let approvedSharedEntriesSelectionRefreshTimer = null;

platform.addInstalledListener(() => {
  registerContextMenus(contextMenuDefinitions(), {
    createContextMenu: platform.createContextMenu
  });
  activateSelectionListenerOnOpenTabs(selectionActivationDependencies());
  primePlaybackSurface("installed");
  refreshApprovedSharedEntries("installed");
  preloadLastResultAudio("installed");
});

platform.addStartupListener(() => {
  activateSelectionListenerOnOpenTabs(selectionActivationDependencies());
  primePlaybackSurface("startup");
  refreshApprovedSharedEntries("startup");
  preloadLastResultAudio("startup");
});
platform.addStorageChangedListener?.((changes, areaName) => {
  sharedAudioStorage.applyStorageChanges(changes, areaName);
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
    getVisibleResultOnTab,
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

platform.addMessageListener((message, sender, sendResponse) =>
  handleRuntimeMessage(message, sendResponse, runtimeMessageDependencies(sender)));

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
      getStorage: sharedAudioStorage.getStorage,
      setStorage: sharedAudioStorage.setStorage,
      fetch: platform.fetch,
      resolveSelection,
      storageKeys: STORAGE_KEYS
    });
    const cachedResult = preloadSharedAudioForPlayback(sharedResult, options.trace);
    if (cachedResult !== sharedResult) {
      setStorageBestEffort({
        [STORAGE_KEYS.lastResult]: cachedResult
      });
    }
    recordDebugEvent("shared-audio:result", {
      elapsedMs: Date.now() - startedAt,
      audio: summarizeAudioForDebug(getBestAudio(cachedResult)),
      result: summarizeResultForDebug(cachedResult),
      trace: options.trace
    });
    return cachedResult;
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
      speech: summarizeSpeechForDebug(speech),
      trace: overrides.trace
    });
    return speech;
  } catch (error) {
    recordDebugEvent("speech:error", {
      elapsedMs: Date.now() - startedAt,
      error: errorMessage(error),
      trace: overrides.trace
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

async function prepareAudio(audio, trace) {
  if (!platform.hasOffscreenAudioSupport?.()) {
    return false;
  }

  const startedAt = Date.now();
  recordDebugEvent("audio-preload:start", {
    audio: summarizeAudioForDebug(audio),
    trace
  });
  try {
    const prepared = await playbackSurface.prepareAudioItemOffscreen(audio, trace);
    recordDebugEvent("audio-preload:result", {
      elapsedMs: Date.now() - startedAt,
      prepared: Boolean(prepared),
      trace
    });
    return prepared;
  } catch (error) {
    recordDebugEvent("audio-preload:error", {
      elapsedMs: Date.now() - startedAt,
      error: errorMessage(error),
      trace
    });
    return false;
  }
}

async function playResolvedResult(result, tabId, trace) {
  const startedAt = Date.now();
  recordDebugEvent("playback:start", {
    audio: summarizeAudioForDebug(getBestAudio(result)),
    result: summarizeResultForDebug(result),
    tabId,
    trace
  });
  try {
    const playback = await playbackSurface.playResolvedResult(result, tabId, trace);
    recordDebugEvent("playback:result", {
      elapsedMs: Date.now() - startedAt,
      mode: playback?.mode || "",
      error: playback?.error || "",
      trace
    });
    return playback;
  } catch (error) {
    recordDebugEvent("playback:error", {
      elapsedMs: Date.now() - startedAt,
      error: errorMessage(error),
      trace
    });
    throw error;
  }
}

async function showResultOnTab(tabId, result, options = {}) {
  return playbackSurface.showResultOnTab(tabId, result, options);
}

async function getVisibleResultOnTab(tabId) {
  if (!tabId) {
    return null;
  }

  try {
    const response = await platform.sendTabMessage(tabId, createGetVisibleResultMessage());
    return response?.ok && response.result && typeof response.result === "object"
      ? response.result
      : null;
  } catch {
    return null;
  }
}

async function stopPlayback() {
  return playbackSurface.stopPlayback();
}

async function preparePlayback(trace) {
  if (!platform.hasOffscreenAudioSupport?.()) {
    refreshApprovedSharedEntriesForSelectionPrime(trace);
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
    refreshApprovedSharedEntriesForSelectionPrime(trace);
    return true;
  } catch (error) {
    recordDebugEvent("audio-prepare:error", {
      elapsedMs: Date.now() - startedAt,
      error: errorMessage(error),
      trace
    });
    refreshApprovedSharedEntriesForSelectionPrime(trace);
    return false;
  }
}

function primePlaybackSurface(reason) {
  const trace = {
    id: `background-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    source: "background",
    action: `playback-prime-${reason}`,
    startedAt: Date.now()
  };
  try {
    const prepared = preparePlayback(trace);
    if (prepared && typeof prepared.catch === "function") {
      prepared.catch(() => {});
    }
  } catch {
    // First user-triggered playback can still create the offscreen surface.
  }
}

function refreshApprovedSharedEntries(reason) {
  const startedAt = Date.now();
  if (approvedSharedEntriesRefreshPromise) {
    recordDebugEvent("approved-pull:skip", {
      reason,
      skipped: "pending"
    });
    return approvedSharedEntriesRefreshPromise;
  }

  approvedSharedEntriesLastRefreshAt = startedAt;
  recordDebugEvent("approved-pull:start", {
    reason
  });
  approvedSharedEntriesRefreshPromise = pullApprovedCommunityEntries()
    .then((summary) => {
      recordDebugEvent("approved-pull:result", {
        reason,
        elapsedMs: Date.now() - startedAt,
        received: summary?.received || 0,
        total: summary?.total || 0,
        skipped: Boolean(summary?.skipped)
      });
    })
    .catch((error) => {
      recordDebugEvent("approved-pull:error", {
        reason,
        elapsedMs: Date.now() - startedAt,
        error: errorMessage(error)
      });
    })
    .finally(() => {
      approvedSharedEntriesRefreshPromise = null;
    });
  return approvedSharedEntriesRefreshPromise;
}

function refreshApprovedSharedEntriesForSelectionPrime(trace = null) {
  const normalizedTrace = normalizeDebugTrace(trace);
  if (normalizedTrace?.source !== "content-selection") {
    return;
  }

  const now = Date.now();
  if (
    approvedSharedEntriesRefreshPromise ||
    approvedSharedEntriesSelectionRefreshTimer ||
    now - approvedSharedEntriesLastRefreshAt < APPROVED_SHARED_ENTRIES_SELECTION_REFRESH_MS
  ) {
    return;
  }

  approvedSharedEntriesLastRefreshAt = now;
  recordDebugEvent("approved-pull:defer", {
    reason: "selection-prime",
    delayMs: APPROVED_SHARED_ENTRIES_SELECTION_REFRESH_DELAY_MS,
    trace
  });
  approvedSharedEntriesSelectionRefreshTimer = setTimeout(() => {
    approvedSharedEntriesSelectionRefreshTimer = null;
    refreshApprovedSharedEntries("selection-prime");
  }, APPROVED_SHARED_ENTRIES_SELECTION_REFRESH_DELAY_MS);
  approvedSharedEntriesSelectionRefreshTimer?.unref?.();
}

function preloadLastResultAudio(reason) {
  const trace = {
    id: `background-audio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    source: "background",
    action: `last-audio-preload-${reason}`,
    startedAt: Date.now()
  };
  const startedAt = Date.now();
  platform.getStorage([STORAGE_KEYS.lastResult])
    .then(async (stored) => {
      const result = stored?.[STORAGE_KEYS.lastResult];
      const audio = preloadableSharedAudio(result);
      if (!audio) {
        return;
      }

      recordDebugEvent("last-audio-preload:start", {
        reason,
        audio: summarizeAudioForDebug(audio),
        trace
      });
      const prepared = await prepareAudio({ ...audio, cacheBeforePlayback: true }, trace);
      if (prepared) {
        await platform.setStorage({
          [STORAGE_KEYS.lastResult]: resultWithCachedAudioFlag(result, audio)
        });
      }
      recordDebugEvent("last-audio-preload:result", {
        reason,
        elapsedMs: Date.now() - startedAt,
        prepared: Boolean(prepared),
        trace
      });
    })
    .catch((error) => {
      recordDebugEvent("last-audio-preload:error", {
        reason,
        elapsedMs: Date.now() - startedAt,
        error: errorMessage(error),
        trace
      });
    });
}

function preloadSharedAudioForPlayback(result = {}, trace = null) {
  const audio = preloadableSharedAudio(result);
  if (!audio) {
    return result;
  }

  const cachedResult = resultWithCachedAudioFlag(result, audio);
  try {
    const prepared = prepareAudio({ ...audio, cacheBeforePlayback: true }, trace);
    if (prepared && typeof prepared.catch === "function") {
      prepared.catch(() => {});
    }
  } catch {
    // Playback can still fetch the audio lazily.
  }

  return cachedResult;
}

function setStorageBestEffort(value = {}) {
  try {
    const stored = platform.setStorage(value);
    if (stored && typeof stored.catch === "function") {
      stored.catch(() => {});
    }
  } catch {
    // Storage bookkeeping should not block pronunciation.
  }
}

function preloadableSharedAudio(result = {}) {
  const audio = getBestAudio(result);
  if (!audio?.url) {
    return null;
  }

  const sourceStatus = normalizeSelection(result.sourceStatus).toLowerCase();
  const audioQuality = normalizeSelection(audio.quality).toLowerCase();
  const trustSignals = normalizeList(result.trustSignals);
  return sourceStatus === "generated-audio" ||
    audioQuality === "generated" ||
    trustSignals.includes("generated-audio")
    ? audio
    : null;
}

function resultWithCachedAudioFlag(result = {}, audio = {}) {
  const audioUrl = normalizeSelection(audio.url);
  const audioItems = Array.isArray(result.pronunciation?.audio)
    ? result.pronunciation.audio
    : [];
  if (!audioUrl || !audioItems.length) {
    return result;
  }

  return {
    ...result,
    pronunciation: {
      ...(result.pronunciation || {}),
      audio: audioItems.map((item) => normalizeSelection(item?.url) === audioUrl
        ? { ...item, cacheBeforePlayback: true }
        : item)
    }
  };
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

function runtimeMessageDependencies(sender = {}) {
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
    prepareAudio,
    getVisibleResult: () => getVisibleResultOnTab(sender?.tab?.id),
    getStorage: platform.getStorage,
    setStorage: platform.setStorage,
    getDebugState,
    recordDebugEvent,
    lastResultKey: STORAGE_KEYS.lastResult,
    lastSelectionKey: STORAGE_KEYS.lastSelection,
    lastSourceKey: STORAGE_KEYS.lastSource
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
  while (debugEvents.length > DEBUG_EVENT_LIMIT) {
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
    directLookup: Boolean(options.directLookup),
    sharedAudioLocalOnly: Boolean(options.sharedAudioLocalOnly),
    skipRefresh: Boolean(options.skipRefresh),
    trace: normalizeDebugTrace(options.trace)
  };
}

function errorMessage(error) {
  return error?.message || String(error || "Unknown error");
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSelection(item).toLowerCase()).filter(Boolean);
  }

  return String(value || "")
    .split(/[;,\n]/)
    .map((item) => normalizeSelection(item).toLowerCase())
    .filter(Boolean);
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
