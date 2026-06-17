import {
  normalizeCommunityEntries
} from "./resolver-core.js";
import {
  normalizeResultCache,
  resultCacheSummary
} from "./result-cache.js";
import {
  endpointOriginPattern,
  normalizeApprovedEntries,
  normalizeSubmissionQueue
} from "./community-sync.js";
import {
  FORVO_API_ORIGIN
} from "./forvo-adapter.js";
import {
  staleRemotePermissionOrigins
} from "./permission-origins.js";
import {
  createFlushSyncMessage,
  createPullApprovedMessage
} from "./message-contracts.js";
import {
  normalizeApiKey,
  normalizeCredentials,
  normalizeHttpsEndpoint as normalizeEndpoint,
  normalizeLanguageHints,
  normalizeLanguageCode,
  normalizeSettings,
  normalizeShortText
} from "./shared/settings.js";

const STORAGE_KEYS = {
  approvedCommunityEntries: "approvedCommunityEntries",
  communityEntries: "communityEntries",
  communityPullState: "communityPullState",
  credentials: "credentials",
  resultCache: "resultCache",
  syncQueue: "syncQueue",
  syncSummary: "syncSummary",
  settings: "settings"
};
const statusText = document.getElementById("status");
const onlineDefault = document.getElementById("online-default");
const showOverlay = document.getElementById("show-overlay");
const autoSpeakPopup = document.getElementById("auto-speak-popup");
const lookupLanguageHints = document.getElementById("lookup-language-hints");
const customSourceEnabled = document.getElementById("custom-source-enabled");
const customSourceEndpoint = document.getElementById("custom-source-endpoint");
const customSourceLabel = document.getElementById("custom-source-label");
const dbpediaEnabled = document.getElementById("dbpedia-enabled");
const dbpediaEndpoint = document.getElementById("dbpedia-endpoint");
const forvoEnabled = document.getElementById("forvo-enabled");
const forvoApiKey = document.getElementById("forvo-api-key");
const forvoLanguage = document.getElementById("forvo-language");
const gazetteerEnabled = document.getElementById("gazetteer-enabled");
const gazetteerEndpoint = document.getElementById("gazetteer-endpoint");
const cacheSummaryText = document.getElementById("cache-summary");
const clearCacheButton = document.getElementById("clear-cache");
const memorySummary = document.getElementById("memory-summary");
const exportButton = document.getElementById("export-data");
const importButton = document.getElementById("import-data");
const clearButton = document.getElementById("clear-memory");
const dataBox = document.getElementById("data-box");
const syncEnabled = document.getElementById("sync-enabled");
const pullEnabled = document.getElementById("pull-enabled");
const syncEndpoint = document.getElementById("sync-endpoint");
const syncSummaryText = document.getElementById("sync-summary");
const flushSyncButton = document.getElementById("flush-sync");
const pullApprovedButton = document.getElementById("pull-approved");
const clearApprovedButton = document.getElementById("clear-approved");
const clearSyncButton = document.getElementById("clear-sync");
const approvedSummary = document.getElementById("approved-summary");

init();

onlineDefault.addEventListener("change", saveSettings);
showOverlay.addEventListener("change", saveSettings);
autoSpeakPopup.addEventListener("change", saveSettings);
lookupLanguageHints.addEventListener("change", saveSettings);
customSourceEnabled.addEventListener("change", saveSettings);
customSourceEndpoint.addEventListener("change", saveSettings);
customSourceLabel.addEventListener("change", saveSettings);
dbpediaEnabled.addEventListener("change", saveSettings);
dbpediaEndpoint.addEventListener("change", saveSettings);
forvoEnabled.addEventListener("change", saveSettings);
forvoApiKey.addEventListener("change", saveSettings);
forvoLanguage.addEventListener("change", saveSettings);
gazetteerEnabled.addEventListener("change", saveSettings);
gazetteerEndpoint.addEventListener("change", saveSettings);
clearCacheButton.addEventListener("click", clearLookupCache);
syncEnabled.addEventListener("change", saveSettings);
pullEnabled.addEventListener("change", saveSettings);
syncEndpoint.addEventListener("change", saveSettings);
exportButton.addEventListener("click", exportData);
importButton.addEventListener("click", importData);
clearButton.addEventListener("click", clearMemory);
flushSyncButton.addEventListener("click", flushSync);
pullApprovedButton.addEventListener("click", pullApproved);
clearApprovedButton.addEventListener("click", clearApprovedEntries);
clearSyncButton.addEventListener("click", clearSyncQueue);

async function init() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.credentials,
    STORAGE_KEYS.approvedCommunityEntries,
    STORAGE_KEYS.communityPullState,
    STORAGE_KEYS.communityEntries,
    STORAGE_KEYS.resultCache,
    STORAGE_KEYS.syncQueue,
    STORAGE_KEYS.syncSummary
  ]);
  const settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  const credentials = normalizeCredentials(stored[STORAGE_KEYS.credentials]);
  onlineDefault.checked = settings.onlineByDefault;
  showOverlay.checked = settings.showOverlay;
  autoSpeakPopup.checked = settings.autoSpeakPopup;
  lookupLanguageHints.value = settings.lookupLanguageHints.join(", ");
  customSourceEnabled.checked = settings.customSourceEnabled;
  customSourceEndpoint.value = settings.customSourceEndpoint;
  customSourceLabel.value = settings.customSourceLabel;
  dbpediaEnabled.checked = settings.dbpediaEnabled;
  dbpediaEndpoint.value = settings.dbpediaEndpoint;
  forvoEnabled.checked = settings.forvoEnabled;
  forvoApiKey.value = credentials.forvoApiKey;
  forvoLanguage.value = settings.forvoLanguage;
  gazetteerEnabled.checked = settings.gazetteerEnabled;
  gazetteerEndpoint.value = settings.gazetteerEndpoint;
  syncEnabled.checked = settings.communitySyncEnabled;
  pullEnabled.checked = settings.communityPullEnabled;
  syncEndpoint.value = settings.communityEndpoint;
  renderCacheSummary(stored[STORAGE_KEYS.resultCache]);
  renderSummary(stored[STORAGE_KEYS.communityEntries] || {});
  renderSyncSummary(stored[STORAGE_KEYS.syncSummary], stored[STORAGE_KEYS.syncQueue]);
  renderApprovedSummary(stored[STORAGE_KEYS.approvedCommunityEntries], stored[STORAGE_KEYS.communityPullState]);
  setStatus("Settings loaded.");
}

async function saveSettings() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.credentials
  ]);
  const previousSettings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  const previousCredentials = normalizeCredentials(stored[STORAGE_KEYS.credentials]);
  const wantedSync = syncEnabled.checked && Boolean(normalizeEndpoint(syncEndpoint.value));
  const wantedPull = pullEnabled.checked && Boolean(normalizeEndpoint(syncEndpoint.value));
  const wantedCustomSource = customSourceEnabled.checked && Boolean(normalizeEndpoint(customSourceEndpoint.value));
  const wantedDbpedia = dbpediaEnabled.checked && Boolean(normalizeEndpoint(dbpediaEndpoint.value));
  const wantedForvo = forvoEnabled.checked && Boolean(normalizeApiKey(forvoApiKey.value));
  const wantedGazetteer = gazetteerEnabled.checked && Boolean(normalizeEndpoint(gazetteerEndpoint.value));
  const credentials = credentialsFromControls();
  const settings = await settingsFromControls(credentials);
  await removeUnusedRemotePermissions(previousSettings, settings, previousCredentials, credentials);
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: settings,
    [STORAGE_KEYS.credentials]: credentials
  });
  customSourceEnabled.checked = settings.customSourceEnabled;
  autoSpeakPopup.checked = settings.autoSpeakPopup;
  lookupLanguageHints.value = settings.lookupLanguageHints.join(", ");
  customSourceEndpoint.value = settings.customSourceEndpoint;
  customSourceLabel.value = settings.customSourceLabel;
  dbpediaEnabled.checked = settings.dbpediaEnabled;
  dbpediaEndpoint.value = settings.dbpediaEndpoint;
  forvoEnabled.checked = settings.forvoEnabled;
  forvoApiKey.value = credentials.forvoApiKey;
  forvoLanguage.value = settings.forvoLanguage;
  gazetteerEnabled.checked = settings.gazetteerEnabled;
  gazetteerEndpoint.value = settings.gazetteerEndpoint;
  syncEnabled.checked = settings.communitySyncEnabled;
  pullEnabled.checked = settings.communityPullEnabled;
  syncEndpoint.value = settings.communityEndpoint;
  setStatus((settings.communitySyncEnabled || !wantedSync) &&
      (settings.communityPullEnabled || !wantedPull) &&
      (settings.customSourceEnabled || !wantedCustomSource) &&
      (settings.dbpediaEnabled || !wantedDbpedia) &&
      (settings.gazetteerEnabled || !wantedGazetteer) &&
      (settings.forvoEnabled || !wantedForvo)
    ? "Settings saved."
    : "Settings saved. Endpoint permission was not granted.");
}

async function exportData() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.approvedCommunityEntries,
    STORAGE_KEYS.communityPullState,
    STORAGE_KEYS.communityEntries,
    STORAGE_KEYS.resultCache,
    STORAGE_KEYS.syncQueue,
    STORAGE_KEYS.syncSummary
  ]);
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    settings: normalizeSettings(stored[STORAGE_KEYS.settings]),
    approvedCommunityEntries: normalizeApprovedEntries({
      entries: stored[STORAGE_KEYS.approvedCommunityEntries]
    }),
    communityPullState: stored[STORAGE_KEYS.communityPullState] || {},
    communityEntries: normalizeCommunityEntries(stored[STORAGE_KEYS.communityEntries]),
    resultCache: normalizeResultCache(stored[STORAGE_KEYS.resultCache]),
    syncQueue: normalizeSubmissionQueue(stored[STORAGE_KEYS.syncQueue]),
    syncSummary: stored[STORAGE_KEYS.syncSummary] || {}
  };

  dataBox.value = JSON.stringify(payload, null, 2);
  renderCacheSummary(payload.resultCache);
  renderSummary(payload.communityEntries);
  setStatus("Export ready.");
}

async function importData() {
  let payload;
  try {
    payload = JSON.parse(dataBox.value);
  } catch {
    setStatus("Import data is not valid JSON.");
    return;
  }

  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.credentials
  ]);
  const previousSettings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  const previousCredentials = normalizeCredentials(stored[STORAGE_KEYS.credentials]);
  const credentials = normalizeCredentials(stored[STORAGE_KEYS.credentials]);
  const settings = await settingsWithEndpointPermission(payload.settings, credentials);
  const approvedCommunityEntries = normalizeApprovedEntries({ entries: payload.approvedCommunityEntries });
  const communityEntries = normalizeCommunityEntries(payload.communityEntries);
  const resultCache = normalizeResultCache(payload.resultCache);
  const syncQueue = normalizeSubmissionQueue(payload.syncQueue);
  const importedSyncSummary = summarizeQueue(syncQueue);
  const communityPullState = isPlainObject(payload.communityPullState) ? payload.communityPullState : {};
  await removeUnusedRemotePermissions(previousSettings, settings, previousCredentials, credentials);
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: settings,
    [STORAGE_KEYS.approvedCommunityEntries]: approvedCommunityEntries,
    [STORAGE_KEYS.communityPullState]: communityPullState,
    [STORAGE_KEYS.communityEntries]: communityEntries,
    [STORAGE_KEYS.resultCache]: resultCache,
    [STORAGE_KEYS.syncQueue]: syncQueue,
    [STORAGE_KEYS.syncSummary]: importedSyncSummary
  });

  onlineDefault.checked = settings.onlineByDefault;
  showOverlay.checked = settings.showOverlay;
  autoSpeakPopup.checked = settings.autoSpeakPopup;
  lookupLanguageHints.value = settings.lookupLanguageHints.join(", ");
  customSourceEnabled.checked = settings.customSourceEnabled;
  customSourceEndpoint.value = settings.customSourceEndpoint;
  customSourceLabel.value = settings.customSourceLabel;
  dbpediaEnabled.checked = settings.dbpediaEnabled;
  dbpediaEndpoint.value = settings.dbpediaEndpoint;
  forvoEnabled.checked = settings.forvoEnabled;
  forvoApiKey.value = credentials.forvoApiKey;
  forvoLanguage.value = settings.forvoLanguage;
  gazetteerEnabled.checked = settings.gazetteerEnabled;
  gazetteerEndpoint.value = settings.gazetteerEndpoint;
  syncEnabled.checked = settings.communitySyncEnabled;
  pullEnabled.checked = settings.communityPullEnabled;
  syncEndpoint.value = settings.communityEndpoint;
  renderCacheSummary(resultCache);
  renderSummary(communityEntries);
  renderSyncSummary(importedSyncSummary);
  renderApprovedSummary(approvedCommunityEntries, communityPullState);
  setStatus("Import saved.");
}

async function clearMemory() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.communityEntries]: {}
  });
  dataBox.value = "";
  renderSummary({});
  setStatus("Community memory cleared.");
}

async function clearLookupCache() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.resultCache]: normalizeResultCache({})
  });
  renderCacheSummary({});
  setStatus("Lookup cache cleared.");
}

async function flushSync() {
  const response = await sendMessage(createFlushSyncMessage());
  if (!response.ok) {
    setStatus(response.error || "Sync failed.");
    return;
  }

  renderSyncSummary(response.summary);
  setStatus(`Sync sent ${response.summary.sent || 0}.`);
}

async function pullApproved() {
  const response = await sendMessage(createPullApprovedMessage());
  if (!response.ok) {
    setStatus(response.error || "Refresh failed.");
    return;
  }

  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.approvedCommunityEntries,
    STORAGE_KEYS.communityPullState
  ]);
  renderApprovedSummary(stored[STORAGE_KEYS.approvedCommunityEntries], stored[STORAGE_KEYS.communityPullState]);
  setStatus(response.summary.skipped ? "Approved refresh is disabled." : `Refreshed ${response.summary.received || 0}.`);
}

async function clearSyncQueue() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.syncQueue]: [],
    [STORAGE_KEYS.syncSummary]: { queued: 0, failed: 0, exhausted: 0 }
  });
  renderSyncSummary({ queued: 0, failed: 0, exhausted: 0 });
  setStatus("Sync queue cleared.");
}

async function clearApprovedEntries() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.approvedCommunityEntries]: {},
    [STORAGE_KEYS.communityPullState]: {}
  });
  renderApprovedSummary({}, {});
  setStatus("Approved shared entries cleared.");
}

function renderSummary(entries) {
  const values = Object.values(entries || {});
  const confirmations = values.reduce((sum, entry) => sum + Number(entry.confirmations || 0), 0);
  const corrections = values.reduce((sum, entry) => sum + Number(entry.corrections || 0), 0);
  const requests = values.reduce((sum, entry) => sum + Number(entry.requests || 0), 0);
  const flags = values.reduce((sum, entry) => sum + Number(entry.flags || 0), 0);

  memorySummary.textContent = values.length
    ? `${values.length} local entries · ${confirmations} confirmations · ${corrections} corrections · ${requests} requests · ${flags} wrong-result flags`
    : "No local entries.";
}

function renderCacheSummary(cache) {
  const summary = resultCacheSummary(cache);
  cacheSummaryText.textContent = summary.count
    ? `${summary.count} cached lookup${summary.count === 1 ? "" : "s"}${summary.newestAt ? ` · updated ${new Date(summary.newestAt).toLocaleString()}` : ""}`
    : "No cached lookups.";
}

function renderSyncSummary(summary, queue) {
  const safe = summary || summarizeQueue(queue);

  syncSummaryText.textContent = safe.queued
    ? `${safe.queued} queued · ${safe.failed || 0} failed · ${safe.exhausted || 0} exhausted`
    : "No queued submissions.";
}

function renderApprovedSummary(entries = {}, state = {}) {
  const count = Object.keys(entries || {}).length;
  approvedSummary.textContent = count
    ? `${count} approved shared entries${state?.pulledAt ? ` · updated ${new Date(state.pulledAt).toLocaleString()}` : ""}`
    : "No approved shared entries.";
}

function summarizeQueue(queue) {
  return {
    queued: Array.isArray(queue) ? queue.length : 0,
    failed: Array.isArray(queue) ? queue.filter((item) => item.lastError).length : 0,
    exhausted: Array.isArray(queue) ? queue.filter((item) => item.attempts >= 5).length : 0
  };
}

function credentialsFromControls() {
  return normalizeCredentials({
    forvoApiKey: forvoApiKey.value
  });
}

async function settingsFromControls(credentials) {
  return settingsWithEndpointPermission({
    onlineByDefault: onlineDefault.checked,
    showOverlay: showOverlay.checked,
    autoSpeakPopup: autoSpeakPopup.checked,
    lookupLanguageHints: normalizeLanguageHints(lookupLanguageHints.value),
    customSourceEnabled: customSourceEnabled.checked,
    customSourceEndpoint: normalizeEndpoint(customSourceEndpoint.value),
    customSourceLabel: normalizeShortText(customSourceLabel.value),
    dbpediaEnabled: dbpediaEnabled.checked,
    dbpediaEndpoint: normalizeEndpoint(dbpediaEndpoint.value),
    forvoEnabled: forvoEnabled.checked,
    forvoLanguage: normalizeLanguageCode(forvoLanguage.value),
    gazetteerEnabled: gazetteerEnabled.checked,
    gazetteerEndpoint: normalizeEndpoint(gazetteerEndpoint.value),
    communitySyncEnabled: syncEnabled.checked,
    communityPullEnabled: pullEnabled.checked,
    communityEndpoint: normalizeEndpoint(syncEndpoint.value)
  }, credentials);
}

async function settingsWithEndpointPermission(value = {}, credentials = {}) {
  let settings = normalizeSettings(value);
  const normalizedCredentials = normalizeCredentials(credentials);

  if (settings.customSourceEnabled) {
    const granted = await requestEndpointPermission(settings.customSourceEndpoint);
    settings = {
      ...settings,
      customSourceEnabled: Boolean(granted)
    };
  }

  if (settings.forvoEnabled) {
    const granted = normalizedCredentials.forvoApiKey
      ? await requestEndpointPermission(FORVO_API_ORIGIN)
      : false;
    settings = {
      ...settings,
      forvoEnabled: Boolean(granted)
    };
  }

  if (settings.dbpediaEnabled) {
    const granted = await requestEndpointPermission(settings.dbpediaEndpoint);
    settings = {
      ...settings,
      dbpediaEnabled: Boolean(granted)
    };
  }

  if (settings.gazetteerEnabled) {
    const granted = await requestEndpointPermission(settings.gazetteerEndpoint);
    settings = {
      ...settings,
      gazetteerEnabled: Boolean(granted)
    };
  }

  if (settings.communitySyncEnabled || settings.communityPullEnabled) {
    const granted = await requestEndpointPermission(settings.communityEndpoint);
    settings = {
      ...settings,
      communitySyncEnabled: Boolean(settings.communitySyncEnabled && granted),
      communityPullEnabled: Boolean(settings.communityPullEnabled && granted)
    };
  }

  return settings;
}

async function requestEndpointPermission(endpoint) {
  const origin = endpointOriginPattern(endpoint);
  if (!origin || !chrome.permissions) {
    return Boolean(origin);
  }

  if (await chrome.permissions.contains({ origins: [origin] })) {
    return true;
  }

  return chrome.permissions.request({ origins: [origin] });
}

async function removeUnusedRemotePermissions(previousSettings, nextSettings, previousCredentials, nextCredentials) {
  if (!chrome.permissions?.remove) {
    return;
  }

  for (const origin of staleRemotePermissionOrigins(previousSettings, nextSettings, previousCredentials, nextCredentials)) {
    try {
      await chrome.permissions.remove({ origins: [origin] });
    } catch {
      // Permission cleanup is best-effort; saving settings should still finish.
    }
  }
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function setStatus(value) {
  statusText.textContent = value;
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      resolve(response || { ok: false, error: "No response." });
    });
  });
}
