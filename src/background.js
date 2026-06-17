import {
  applyCommunitySummary,
  createLookupKey,
  getBestAudio,
  mapResultAudioUrls,
  mergeRemoteResult,
  normalizeSelection,
  resultToSpeechOptions,
  resolveTerm,
  hasCommunityPronunciationData,
  updateCommunityEntries
} from "./resolver-core.js";
import {
  isCacheableResult,
  readCachedResult,
  upsertCachedResult
} from "./result-cache.js";
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
  createCommunitySubmission,
  enqueueSubmissionWhenEnabled,
  flushSubmissionQueue,
  mergeApprovedEntries,
  pullApprovedEntries,
  syncSummary
} from "./community-sync.js";
import {
  normalizeCredentials,
  normalizeLanguageHints,
  normalizeSettings,
  onlineCacheScope
} from "./shared/settings.js";
import {
  resolveWithOnlineSources
} from "./background/online-sources.js";
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
  const selectedText = normalizeSelection(text);
  const data = await loadSeedData();
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.approvedCommunityEntries,
    STORAGE_KEYS.communityEntries,
    STORAGE_KEYS.credentials,
    STORAGE_KEYS.resultCache,
    STORAGE_KEYS.settings
  ]);
  const communityEntries = {
    ...(stored[STORAGE_KEYS.approvedCommunityEntries] || {}),
    ...(stored[STORAGE_KEYS.communityEntries] || {})
  };
  const settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  const credentials = normalizeCredentials(stored[STORAGE_KEYS.credentials]);
  const hasRequestHints = normalizeLanguageHints(options.languageHints).length > 0;
  const onlineSettings = onlineSettingsForRequest(settings, options);
  const localResult = resolveTerm(selectedText, {
    entries: data.entries,
    communityEntries
  });

  let result = localResult;
  const shouldUseOnline = options.useOnline ?? (hasRequestHints || onlineSettings.onlineByDefault);
  let resultCache = stored[STORAGE_KEYS.resultCache];
  if (shouldUseOnline) {
    const cacheOptions = { cacheScope: onlineCacheScope(onlineSettings, credentials) };
    const cached = readCachedResult(resultCache, selectedText, cacheOptions);
    resultCache = cached.cache;

    try {
      const remoteResult = cached.hit
        ? cached.result
        : await resolveWithOnlineSources(selectedText, onlineSettings, credentials, {
          localResult
        });
      if (!cached.hit && isCacheableResult(remoteResult)) {
        resultCache = upsertCachedResult(resultCache, selectedText, remoteResult, cacheOptions);
      }
      result = mergeRemoteResult(localResult, remoteResult);
    } catch {
      result = {
        ...localResult,
        evidence: [...(localResult.evidence || []), "Online lookup unavailable"]
      };
    }
  }

  result = mapResultAudioUrls(result, (url) => chrome.runtime.getURL(url));

  const updates = {
    [STORAGE_KEYS.lastSelection]: selectedText,
    [STORAGE_KEYS.lastResult]: result
  };
  if (shouldUseOnline) {
    updates[STORAGE_KEYS.resultCache] = resultCache;
  }

  await chrome.storage.local.set(updates);

  return result;
}

async function saveFeedback(text, feedback) {
  const selectedText = normalizeSelection(text);
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.communityEntries,
    STORAGE_KEYS.settings,
    STORAGE_KEYS.syncQueue,
    STORAGE_KEYS.lastResult
  ]);
  const settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  const communityEntries = updateCommunityEntries(stored[STORAGE_KEYS.communityEntries], selectedText, feedback);
  const submission = createCommunitySubmission(selectedText, feedback, stored[STORAGE_KEYS.lastResult]);
  const syncQueue = enqueueSubmissionWhenEnabled(stored[STORAGE_KEYS.syncQueue], submission, settings);
  await chrome.storage.local.set({
    [STORAGE_KEYS.communityEntries]: communityEntries,
    [STORAGE_KEYS.syncQueue]: syncQueue,
    [STORAGE_KEYS.syncSummary]: syncSummary(syncQueue)
  });

  if (settings.communitySyncEnabled) {
    flushCommunitySync().catch(() => {});
  }

  const feedbackResult = await resultAfterFeedback(selectedText, stored[STORAGE_KEYS.lastResult], communityEntries);
  await chrome.storage.local.set({
    [STORAGE_KEYS.lastSelection]: selectedText,
    [STORAGE_KEYS.lastResult]: feedbackResult
  });
  return feedbackResult;
}

async function resultAfterFeedback(selectedText, lastResult, communityEntries) {
  const lookupKey = createLookupKey(selectedText);
  const communityEntry = communityEntries?.[lookupKey];
  if (hasCommunityPronunciationData(communityEntry)) {
    return resolveSelection(selectedText, { useOnline: false });
  }

  if (resultMatchesSelection(lastResult, lookupKey)) {
    return applyCommunitySummary(lastResult, communityEntry);
  }

  return resolveSelection(selectedText, { useOnline: false });
}

function resultMatchesSelection(result, lookupKey) {
  if (!result || !lookupKey) {
    return false;
  }

  return [
    result.query,
    result.display
  ].some((value) => createLookupKey(value) === lookupKey);
}

async function flushCommunitySync() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.settings, STORAGE_KEYS.syncQueue]);
  const settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  const result = await flushSubmissionQueue(stored[STORAGE_KEYS.syncQueue], settings, postCommunitySubmission);
  const summary = syncSummary(result.queue);
  await chrome.storage.local.set({
    [STORAGE_KEYS.syncQueue]: result.queue,
    [STORAGE_KEYS.syncSummary]: summary
  });

  return {
    ...summary,
    sent: result.sent,
    failedThisRun: result.failed
  };
}

async function pullApprovedCommunityEntries() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.approvedCommunityEntries,
    STORAGE_KEYS.settings
  ]);
  const settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  const result = await pullApprovedEntries(settings, fetchApprovedCommunityEntries);
  const approvedCommunityEntries = mergeApprovedEntries(
    stored[STORAGE_KEYS.approvedCommunityEntries],
    result.entries
  );
  const summary = {
    received: result.received,
    total: Object.keys(approvedCommunityEntries).length,
    pulledAt: result.pulledAt,
    skipped: result.skipped
  };

  await chrome.storage.local.set({
    [STORAGE_KEYS.approvedCommunityEntries]: approvedCommunityEntries,
    [STORAGE_KEYS.communityPullState]: summary
  });

  return summary;
}

async function postCommunitySubmission(endpoint, submission) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(submission)
  });

  if (!response.ok) {
    throw new Error(`Community sync failed with ${response.status}`);
  }
}

async function fetchApprovedCommunityEntries(endpoint) {
  const url = new URL(endpoint);
  url.searchParams.set("action", "approved");
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Community refresh failed with ${response.status}`);
  }

  return response.json();
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

function onlineSettingsForRequest(settings, options = {}) {
  const requestHints = normalizeLanguageHints(options.languageHints);
  if (!requestHints.length) {
    return settings;
  }

  return {
    ...settings,
    lookupLanguageHints: normalizeLanguageHints([
      ...settings.lookupLanguageHints,
      ...requestHints
    ])
  };
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
