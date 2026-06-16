import {
  applyCommunitySummary,
  createLookupKey,
  getBestAudio,
  mapResultAudioUrls,
  mergeRemoteResult,
  normalizeSelection,
  resultToSpeechOptions,
  resolveTerm,
  updateCommunityEntries
} from "./resolver-core.js";
import {
  selectBestWikidataResult,
  wikidataSearchLanguages
} from "./wikidata-adapter.js";
import {
  buildWiktionaryResult
} from "./wiktionary-adapter.js";
import {
  buildNominatimResult,
  buildNominatimSearchUrl
} from "./nominatim-adapter.js";
import {
  buildForvoResult,
  buildForvoWordPronunciationsUrl
} from "./forvo-adapter.js";
import {
  additionalPronunciationLookupCandidates,
  pronunciationLookupCandidates
} from "./pronunciation-source-plan.js";
import {
  buildCustomSourceResult,
  buildCustomSourceUrl
} from "./custom-source-adapter.js";
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
  createShowResultMessage,
  MESSAGE_TYPES
} from "./message-contracts.js";
import {
  createCommunitySubmission,
  DEFAULT_SYNC_SETTINGS,
  enqueueSubmissionWhenEnabled,
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
  credentials: "credentials",
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
  autoSpeakPopup: true,
  customSourceEnabled: false,
  customSourceEndpoint: "",
  customSourceLabel: "",
  forvoEnabled: false,
  forvoLanguage: "",
  gazetteerEnabled: false,
  gazetteerEndpoint: "",
  ...DEFAULT_SYNC_SETTINGS
};
const DEFAULT_CREDENTIALS = {
  forvoApiKey: ""
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
  if (command === "pronounce-selection") {
    pronounceActiveSelection({
      source: "keyboard"
    });
  }

  if (command === "pronounce-selection-online") {
    pronounceActiveSelection({
      source: "keyboard-online",
      useOnline: true
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.resolve) {
    resolveSelection(message.text, useOnlineMessageOptions(message))
      .then((result) => {
        sendResponse({ ok: true, result });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || "Resolve failed." });
      });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.speak) {
    const selectedText = normalizeSelection(message.text);
    if (!selectedText) {
      sendResponse({ ok: false, error: "No text selected." });
      return true;
    }

    const resultPromise = message.result
      ? Promise.resolve(message.result)
      : resolveSelection(selectedText, useOnlineMessageOptions(message));

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

  if (message?.type === MESSAGE_TYPES.stop) {
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

  if (message?.type === MESSAGE_TYPES.feedback) {
    saveFeedback(message.text, message.feedback || {})
      .then((result) => {
        sendResponse({ ok: true, result });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || "Feedback failed." });
      });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.flushSync) {
    flushCommunitySync()
      .then((summary) => {
        sendResponse({ ok: true, summary });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || "Sync failed." });
      });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.pullApproved) {
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
  const localResult = resolveTerm(selectedText, {
    entries: data.entries,
    communityEntries
  });

  let result = localResult;
  const shouldUseOnline = options.useOnline ?? settings.onlineByDefault;
  let resultCache = stored[STORAGE_KEYS.resultCache];
  if (shouldUseOnline) {
    const cacheOptions = { cacheScope: onlineCacheScope(settings, credentials) };
    const cached = readCachedResult(resultCache, selectedText, cacheOptions);
    resultCache = cached.cache;

    try {
      const remoteResult = cached.hit
        ? cached.result
        : await resolveWithOnlineSources(selectedText, settings, credentials);
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

function hasCommunityPronunciationData(entry = {}) {
  return Boolean(entry.sourceForm || entry.language || entry.ipa || entry.simple || entry.audioUrl || entry.sourceUrl || entry.variantNote);
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

async function pronounceActiveSelection(options = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }

  const selectedText = await readSelectionFromTab(tab.id);
  if (!selectedText) {
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.lastSelection]: selectedText,
    [STORAGE_KEYS.lastSource]: options.source || "keyboard"
  });

  const result = await resolveSelection(selectedText, {
    useOnline: options.useOnline
  });
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
    const response = await chrome.runtime.sendMessage(createOffscreenPlayAudioMessage(
      audio,
      rate < 0.7 ? 0.75 : 1
    ));
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
    await chrome.runtime.sendMessage(createOffscreenStopAudioMessage());
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
    await chrome.tabs.sendMessage(tabId, createShowResultMessage(result, {
      autoPlay: Boolean(options.autoPlay)
    }));
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

  const searchResults = await Promise.all(wikidataSearchLanguages(query).map(async (language) => {
    try {
      return await fetchWikidataSearch(query, language);
    } catch {
      return [];
    }
  }));
  const matches = uniqueWikidataMatches(searchResults.flat()).slice(0, 8);
  if (!matches.length) {
    return null;
  }

  const entityById = await fetchWikidataEntities(matches.slice(0, 5));
  return selectBestWikidataResult(query, matches, entityById);
}

async function fetchWikidataSearch(query, language) {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: query,
    language,
    uselang: "en",
    format: "json",
    origin: "*",
    limit: "8"
  });

  const searchResponse = await fetch(`https://www.wikidata.org/w/api.php?${params.toString()}`);
  if (!searchResponse.ok) {
    return [];
  }

  const searchData = await searchResponse.json();
  return (searchData.search || [])
    .filter((match) => match?.id)
    .map((match) => ({
      ...match,
      language: match.language || language
    }));
}

function uniqueWikidataMatches(matches = []) {
  const seen = new Set();
  const unique = [];

  for (const match of matches) {
    if (!match?.id || seen.has(match.id)) {
      continue;
    }

    seen.add(match.id);
    unique.push(match);
  }

  return unique;
}

async function resolveWithOnlineSources(text, settings = {}, credentials = {}) {
  const [customSourceResult, wikidataResult, wiktionaryResult, nominatimResult] = await Promise.all([
    settings.customSourceEnabled
      ? resolveSafely(resolveWithCustomSource, text, settings.customSourceEndpoint, settings.customSourceLabel)
      : Promise.resolve(null),
    resolveSafely(resolveWithWikidata, text),
    resolveSafely(resolveWithWiktionary, text),
    settings.gazetteerEnabled
      ? resolveSafely(resolveWithNominatim, text, settings.gazetteerEndpoint)
      : Promise.resolve(null)
  ]);

  const structuredResult = [customSourceResult, wikidataResult, wiktionaryResult, nominatimResult]
    .filter(Boolean)
    .reduce((best, candidate) => mergeRemoteResult(best, candidate), null);
  const wiktionaryCandidateResult = structuredResult
    ? await resolveWithWiktionaryCandidates(text, structuredResult)
    : null;
  const refinedStructuredResult = [structuredResult, wiktionaryCandidateResult]
    .filter(Boolean)
    .reduce((best, candidate) => mergeRemoteResult(best, candidate), null);
  const forvoResult = settings.forvoEnabled
    ? await resolveWithForvoCandidates(text, refinedStructuredResult, credentials.forvoApiKey, settings)
    : null;

  return [refinedStructuredResult, forvoResult]
    .filter(Boolean)
    .reduce((best, candidate) => mergeRemoteResult(best, candidate), null);
}

async function resolveSafely(resolver, ...args) {
  try {
    return await resolver(...args);
  } catch {
    return null;
  }
}

async function resolveWithWiktionary(text) {
  return resolveWithWiktionaryLookup(text, text);
}

async function resolveWithWiktionaryLookup(selectedText, lookupWord, options = {}) {
  const selected = normalizeSelection(selectedText);
  const query = normalizeSelection(lookupWord);
  if (!selected || !query) {
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

  return buildWiktionaryResult(selected, page.title || query, wikitext, {
    preferredLanguage: options.language
  });
}

async function resolveWithWiktionaryCandidates(text, structuredResult) {
  const query = normalizeSelection(text);
  if (!query) {
    return null;
  }

  let result = null;
  for (const candidate of additionalPronunciationLookupCandidates(query, structuredResult, { limit: 3 })) {
    const wiktionaryResult = await resolveSafely(resolveWithWiktionaryLookup, query, candidate.word, {
      language: candidate.language
    });
    if (!wiktionaryResult) {
      continue;
    }

    result = mergeRemoteResult(result, wiktionaryResult);
    if (result?.sourceStatus === "verified-audio") {
      return result;
    }
  }

  return result;
}

async function resolveWithNominatim(text, endpoint) {
  const query = normalizeSelection(text);
  const url = buildNominatimSearchUrl(query, endpoint, { limit: 5 });
  if (!query || !url) {
    return null;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return buildNominatimResult(query, data);
}

async function resolveWithCustomSource(text, endpoint, label) {
  const query = normalizeSelection(text);
  const url = buildCustomSourceUrl(query, endpoint);
  if (!query || !url) {
    return null;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return buildCustomSourceResult(query, data, { label });
}

async function resolveWithForvo(text, apiKey, language) {
  const query = normalizeSelection(text);
  return resolveWithForvoLookup(query, query, apiKey, language);
}

async function resolveWithForvoLookup(selectedText, lookupWord, apiKey, language) {
  const query = normalizeSelection(selectedText);
  const word = normalizeSelection(lookupWord);
  const url = buildForvoWordPronunciationsUrl(word, apiKey, {
    language,
    limit: 5
  });
  if (!query || !word || !url) {
    return null;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return buildForvoResult(query, data);
}

async function resolveWithForvoCandidates(text, structuredResult, apiKey, settings = {}) {
  let result = null;
  for (const candidate of pronunciationLookupCandidates(text, structuredResult, {
    language: settings.forvoLanguage,
    includeResolvedLanguageFallback: true
  })) {
    const forvoResult = await resolveSafely(resolveWithForvoLookup, text, candidate.word, apiKey, candidate.language);
    if (!forvoResult) {
      continue;
    }

    result = mergeRemoteResult(result, forvoResult);
    if (result?.sourceStatus === "verified-audio") {
      return result;
    }
  }

  return result;
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
  const customSourceEndpoint = normalizeHttpsEndpoint(settings.customSourceEndpoint);
  const gazetteerEndpoint = normalizeHttpsEndpoint(settings.gazetteerEndpoint);
  const forvoLanguage = normalizeLanguageCode(settings.forvoLanguage);
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    onlineByDefault: Boolean(settings.onlineByDefault),
    showOverlay: settings.showOverlay !== false,
    autoSpeakPopup: settings.autoSpeakPopup !== false,
    customSourceEndpoint,
    customSourceLabel: normalizeSelection(settings.customSourceLabel),
    customSourceEnabled: Boolean(settings.customSourceEnabled && customSourceEndpoint),
    forvoLanguage,
    forvoEnabled: Boolean(settings.forvoEnabled),
    gazetteerEndpoint,
    gazetteerEnabled: Boolean(settings.gazetteerEnabled && gazetteerEndpoint),
    ...syncSettings
  };
}

function normalizeCredentials(credentials = {}) {
  return {
    ...DEFAULT_CREDENTIALS,
    forvoApiKey: String(credentials.forvoApiKey || "").trim().replace(/\s+/g, "")
  };
}

function normalizeHttpsEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function onlineCacheScope(settings, credentials = {}) {
  return [
    settings.customSourceEnabled && settings.customSourceEndpoint ? `custom ${settings.customSourceEndpoint}` : "",
    settings.gazetteerEnabled && settings.gazetteerEndpoint ? `gazetteer ${settings.gazetteerEndpoint}` : "",
    settings.forvoEnabled && credentials.forvoApiKey ? `forvo ${settings.forvoLanguage || "all"}` : ""
  ].filter(Boolean).join(" ");
}

function useOnlineMessageOptions(message = {}) {
  if (!Object.prototype.hasOwnProperty.call(message, "useOnline")) {
    return {};
  }

  return { useOnline: Boolean(message.useOnline) };
}

function normalizeLanguageCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .match(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/)?.[0] || "";
}
