import {
  getBestAudio,
  mapResultAudioUrls,
  mergeRemoteResult,
  normalizeSelection,
  resultToSpeechOptions,
  resolveTerm,
  updateCommunityEntries
} from "./resolver-core.js";
import {
  selectBestWikidataResult
} from "./wikidata-adapter.js";
import {
  buildWiktionaryResult
} from "./wiktionary-adapter.js";
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
  createCommunitySubmission,
  DEFAULT_SYNC_SETTINGS,
  enqueueSubmission,
  flushSubmissionQueue,
  mergeApprovedEntries,
  normalizeSyncSettings,
  pullApprovedEntries,
  syncSummary
} from "./community-sync.js";

const OFFSCREEN_AUDIO_URL = "src/offscreen-audio.html";
const STORAGE_KEYS = {
  approvedCommunityEntries: "approvedCommunityEntries",
  communityEntries: "communityEntries",
  communityPullState: "communityPullState",
  lastResult: "lastResult",
  lastSelection: "lastSelection",
  lastSource: "lastSource",
  resultCache: "resultCache",
  syncQueue: "syncQueue",
  syncSummary: "syncSummary",
  settings: "settings"
};
const DEFAULT_SETTINGS = {
  onlineByDefault: false,
  showOverlay: true,
  ...DEFAULT_SYNC_SETTINGS
};

let seedPromise;
let offscreenCreatePromise;

chrome.runtime.onInstalled.addListener(() => {
  for (const item of contextMenuDefinitions()) {
    chrome.contextMenus.create(item);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const action = resolveOptionsForMenuId(info.menuItemId);
  if (!action.ok) {
    return;
  }

  const selectedText = normalizeSelection(info.selectionText);
  if (!selectedText) {
    return;
  }

  chrome.storage.local.set({
    lastSelection: selectedText,
    lastSource: action.source
  });

  resolveSelection(selectedText, action.options)
    .then(async (result) => {
      await chrome.storage.local.set({
        [STORAGE_KEYS.lastResult]: result
      });
      await playResolvedResult(result, tab?.id);
    })
    .catch(() => speakFallback(selectedText));
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "pronounce-selection") {
    return;
  }

  pronounceActiveSelection();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SAYTHIS_RESOLVE") {
    resolveSelection(message.text, { useOnline: Boolean(message.useOnline) })
      .then((result) => {
        sendResponse({ ok: true, result });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || "Resolve failed." });
      });
    return true;
  }

  if (message?.type === "SAYTHIS_SPEAK") {
    const selectedText = normalizeSelection(message.text);
    if (!selectedText) {
      sendResponse({ ok: false, error: "No text selected." });
      return true;
    }

    const resultPromise = message.result
      ? Promise.resolve(message.result)
      : resolveSelection(selectedText, { useOnline: Boolean(message.useOnline) });

    resultPromise
      .then((result) => {
        speakResult(result, { rate: message.rate, lang: message.lang });
        sendResponse({ ok: true, result });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || "Speech failed." });
      });
    return true;
  }

  if (message?.type === "SAYTHIS_STOP") {
    chrome.tts.stop();
    stopOffscreenAudio()
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch(() => {
        sendResponse({ ok: true });
      });
    return true;
  }

  if (message?.type === "SAYTHIS_FEEDBACK") {
    saveFeedback(message.text, message.feedback || {})
      .then((result) => {
        sendResponse({ ok: true, result });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || "Feedback failed." });
      });
    return true;
  }

  if (message?.type === "SAYTHIS_FLUSH_SYNC") {
    flushCommunitySync()
      .then((summary) => {
        sendResponse({ ok: true, summary });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || "Sync failed." });
      });
    return true;
  }

  if (message?.type === "SAYTHIS_PULL_APPROVED") {
    pullApprovedCommunityEntries()
      .then((summary) => {
        sendResponse({ ok: true, summary });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || "Refresh failed." });
      });
    return true;
  }

  return false;
});

async function resolveSelection(text, options = {}) {
  const selectedText = normalizeSelection(text);
  const data = await loadSeedData();
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.approvedCommunityEntries,
    STORAGE_KEYS.communityEntries,
    STORAGE_KEYS.resultCache,
    STORAGE_KEYS.settings
  ]);
  const communityEntries = {
    ...(stored[STORAGE_KEYS.approvedCommunityEntries] || {}),
    ...(stored[STORAGE_KEYS.communityEntries] || {})
  };
  const settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  const localResult = resolveTerm(selectedText, {
    entries: data.entries,
    communityEntries
  });

  let result = localResult;
  const shouldUseOnline = options.useOnline ?? settings.onlineByDefault;
  let resultCache = stored[STORAGE_KEYS.resultCache];
  if (shouldUseOnline) {
    const cached = readCachedResult(resultCache, selectedText);
    resultCache = cached.cache;

    try {
      const remoteResult = cached.hit ? cached.result : await resolveWithOnlineSources(selectedText);
      if (!cached.hit && isCacheableResult(remoteResult)) {
        resultCache = upsertCachedResult(resultCache, selectedText, remoteResult);
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
  const communityEntries = updateCommunityEntries(stored[STORAGE_KEYS.communityEntries], selectedText, feedback);
  const submission = createCommunitySubmission(selectedText, feedback, stored[STORAGE_KEYS.lastResult]);
  const syncQueue = enqueueSubmission(stored[STORAGE_KEYS.syncQueue], submission);
  await chrome.storage.local.set({
    [STORAGE_KEYS.communityEntries]: communityEntries,
    [STORAGE_KEYS.syncQueue]: syncQueue,
    [STORAGE_KEYS.syncSummary]: syncSummary(syncQueue)
  });

  const settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  if (settings.communitySyncEnabled) {
    flushCommunitySync().catch(() => {});
  }

  return resolveSelection(selectedText, { useOnline: false });
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

async function pronounceActiveSelection() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }

  const selectedText = await readSelectionFromTab(tab.id);
  if (!selectedText) {
    return;
  }

  const result = await resolveSelection(selectedText);
  await playResolvedResult(result, tab.id);
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

async function playResolvedResult(result, tabId) {
  const audio = getBestAudio(result);
  if (audio) {
    const shown = await showResultOnTab(tabId, result, { autoPlay: true });
    if (shown) {
      return;
    }

    const played = await playAudioOffscreen(result);
    if (played) {
      showResultOnTab(tabId, result);
      return;
    }
  }

  speakResult(result);
  showResultOnTab(tabId, result);
}

async function playAudioOffscreen(result, rate = 0.82) {
  const audio = getBestAudio(result);
  if (!audio?.url || !chrome.offscreen) {
    return false;
  }

  try {
    await ensureOffscreenAudioDocument();
    const response = await chrome.runtime.sendMessage({
      type: "SAYTHIS_OFFSCREEN_PLAY_AUDIO",
      audio,
      playbackRate: rate < 0.7 ? 0.75 : 1
    });
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}

async function stopOffscreenAudio() {
  if (!chrome.offscreen) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ type: "SAYTHIS_OFFSCREEN_STOP_AUDIO" });
  } catch {
    // The offscreen document may not exist yet.
  }
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
      files: ["src/content-overlay.js"]
    });
    await chrome.tabs.sendMessage(tabId, {
      type: "SAYTHIS_SHOW_RESULT",
      result,
      autoPlay: Boolean(options.autoPlay)
    });
    return true;
  } catch {
    // Some pages do not allow extension script injection.
    return false;
  }
}

async function resolveWithWikidata(text) {
  const query = normalizeSelection(text);
  if (!query) {
    return null;
  }

  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: query,
    language: "en",
    uselang: "en",
    format: "json",
    origin: "*",
    limit: "8"
  });

  const searchResponse = await fetch(`https://www.wikidata.org/w/api.php?${params.toString()}`);
  if (!searchResponse.ok) {
    return null;
  }

  const searchData = await searchResponse.json();
  const matches = (searchData.search || []).filter((match) => match?.id).slice(0, 8);
  if (!matches.length) {
    return null;
  }

  const entityById = await fetchWikidataEntities(matches.slice(0, 5));
  return selectBestWikidataResult(query, matches, entityById);
}

async function resolveWithOnlineSources(text) {
  const [wikidataResult, wiktionaryResult] = await Promise.all([
    resolveSafely(resolveWithWikidata, text),
    resolveSafely(resolveWithWiktionary, text)
  ]);

  return mergeRemoteResult(wikidataResult, wiktionaryResult);
}

async function resolveSafely(resolver, text) {
  try {
    return await resolver(text);
  } catch {
    return null;
  }
}

async function resolveWithWiktionary(text) {
  const query = normalizeSelection(text);
  if (!query) {
    return null;
  }

  const params = new URLSearchParams({
    action: "query",
    prop: "revisions",
    titles: query,
    rvslots: "main",
    rvprop: "content",
    format: "json",
    formatversion: "2",
    origin: "*"
  });

  const response = await fetch(`https://en.wiktionary.org/w/api.php?${params.toString()}`);
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const page = data.query?.pages?.find((candidate) => !candidate.missing);
  const wikitext = page?.revisions?.[0]?.slots?.main?.content;
  if (!wikitext) {
    return null;
  }

  return buildWiktionaryResult(query, page.title || query, wikitext);
}

async function fetchWikidataEntities(matches) {
  const pairs = await Promise.all(matches.map(async (match) => {
    try {
      const response = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(match.id)}.json`);
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const entity = data.entities?.[match.id];
      return entity ? [match.id, entity] : null;
    } catch {
      return null;
    }
  }));

  return Object.fromEntries(pairs.filter(Boolean));
}

async function getSettings() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.settings]);
  return normalizeSettings(stored[STORAGE_KEYS.settings]);
}

function normalizeSettings(settings = {}) {
  const syncSettings = normalizeSyncSettings(settings);
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    onlineByDefault: Boolean(settings.onlineByDefault),
    showOverlay: settings.showOverlay !== false,
    ...syncSettings
  };
}
