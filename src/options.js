import {
  normalizeResultCache,
  resultCacheSummary
} from "./result-cache.js";
import {
  endpointOriginPattern
} from "./community-sync.js";

const STORAGE_KEYS = {
  approvedCommunityEntries: "approvedCommunityEntries",
  communityEntries: "communityEntries",
  communityPullState: "communityPullState",
  resultCache: "resultCache",
  syncQueue: "syncQueue",
  syncSummary: "syncSummary",
  settings: "settings"
};
const DEFAULT_SETTINGS = {
  onlineByDefault: false,
  showOverlay: true,
  gazetteerEnabled: false,
  gazetteerEndpoint: "",
  communitySyncEnabled: false,
  communityEndpoint: ""
};

const statusText = document.getElementById("status");
const onlineDefault = document.getElementById("online-default");
const showOverlay = document.getElementById("show-overlay");
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
const syncEndpoint = document.getElementById("sync-endpoint");
const syncSummaryText = document.getElementById("sync-summary");
const flushSyncButton = document.getElementById("flush-sync");
const pullApprovedButton = document.getElementById("pull-approved");
const clearSyncButton = document.getElementById("clear-sync");
const approvedSummary = document.getElementById("approved-summary");

init();

onlineDefault.addEventListener("change", saveSettings);
showOverlay.addEventListener("change", saveSettings);
gazetteerEnabled.addEventListener("change", saveSettings);
gazetteerEndpoint.addEventListener("change", saveSettings);
clearCacheButton.addEventListener("click", clearLookupCache);
syncEnabled.addEventListener("change", saveSettings);
syncEndpoint.addEventListener("change", saveSettings);
exportButton.addEventListener("click", exportData);
importButton.addEventListener("click", importData);
clearButton.addEventListener("click", clearMemory);
flushSyncButton.addEventListener("click", flushSync);
pullApprovedButton.addEventListener("click", pullApproved);
clearSyncButton.addEventListener("click", clearSyncQueue);

async function init() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.approvedCommunityEntries,
    STORAGE_KEYS.communityPullState,
    STORAGE_KEYS.communityEntries,
    STORAGE_KEYS.resultCache,
    STORAGE_KEYS.syncQueue,
    STORAGE_KEYS.syncSummary
  ]);
  const settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  onlineDefault.checked = settings.onlineByDefault;
  showOverlay.checked = settings.showOverlay;
  gazetteerEnabled.checked = settings.gazetteerEnabled;
  gazetteerEndpoint.value = settings.gazetteerEndpoint;
  syncEnabled.checked = settings.communitySyncEnabled;
  syncEndpoint.value = settings.communityEndpoint;
  renderCacheSummary(stored[STORAGE_KEYS.resultCache]);
  renderSummary(stored[STORAGE_KEYS.communityEntries] || {});
  renderSyncSummary(stored[STORAGE_KEYS.syncSummary], stored[STORAGE_KEYS.syncQueue]);
  renderApprovedSummary(stored[STORAGE_KEYS.approvedCommunityEntries], stored[STORAGE_KEYS.communityPullState]);
  setStatus("Settings loaded.");
}

async function saveSettings() {
  const wantedSync = syncEnabled.checked && Boolean(normalizeEndpoint(syncEndpoint.value));
  const wantedGazetteer = gazetteerEnabled.checked && Boolean(normalizeEndpoint(gazetteerEndpoint.value));
  const settings = await settingsFromControls();
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: settings
  });
  gazetteerEnabled.checked = settings.gazetteerEnabled;
  gazetteerEndpoint.value = settings.gazetteerEndpoint;
  syncEnabled.checked = settings.communitySyncEnabled;
  syncEndpoint.value = settings.communityEndpoint;
  setStatus((settings.communitySyncEnabled || !wantedSync) && (settings.gazetteerEnabled || !wantedGazetteer)
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
    approvedCommunityEntries: stored[STORAGE_KEYS.approvedCommunityEntries] || {},
    communityPullState: stored[STORAGE_KEYS.communityPullState] || {},
    communityEntries: stored[STORAGE_KEYS.communityEntries] || {},
    resultCache: normalizeResultCache(stored[STORAGE_KEYS.resultCache]),
    syncQueue: stored[STORAGE_KEYS.syncQueue] || [],
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

  const settings = await settingsWithEndpointPermission(payload.settings);
  const approvedCommunityEntries = isPlainObject(payload.approvedCommunityEntries) ? payload.approvedCommunityEntries : {};
  const communityEntries = isPlainObject(payload.communityEntries) ? payload.communityEntries : {};
  const resultCache = normalizeResultCache(payload.resultCache);
  const syncQueue = Array.isArray(payload.syncQueue) ? payload.syncQueue : [];
  const importedSyncSummary = summarizeQueue(syncQueue);
  const communityPullState = isPlainObject(payload.communityPullState) ? payload.communityPullState : {};
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
  gazetteerEnabled.checked = settings.gazetteerEnabled;
  gazetteerEndpoint.value = settings.gazetteerEndpoint;
  syncEnabled.checked = settings.communitySyncEnabled;
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
  const response = await sendMessage({ type: "SAYTHIS_FLUSH_SYNC" });
  if (!response.ok) {
    setStatus(response.error || "Sync failed.");
    return;
  }

  renderSyncSummary(response.summary);
  setStatus(`Sync sent ${response.summary.sent || 0}.`);
}

async function pullApproved() {
  const response = await sendMessage({ type: "SAYTHIS_PULL_APPROVED" });
  if (!response.ok) {
    setStatus(response.error || "Refresh failed.");
    return;
  }

  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.approvedCommunityEntries,
    STORAGE_KEYS.communityPullState
  ]);
  renderApprovedSummary(stored[STORAGE_KEYS.approvedCommunityEntries], stored[STORAGE_KEYS.communityPullState]);
  setStatus(`Refreshed ${response.summary.received || 0}.`);
}

async function clearSyncQueue() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.syncQueue]: [],
    [STORAGE_KEYS.syncSummary]: { queued: 0, failed: 0, exhausted: 0 }
  });
  renderSyncSummary({ queued: 0, failed: 0, exhausted: 0 });
  setStatus("Sync queue cleared.");
}

function renderSummary(entries) {
  const values = Object.values(entries || {});
  const confirmations = values.reduce((sum, entry) => sum + Number(entry.confirmations || 0), 0);
  const corrections = values.reduce((sum, entry) => sum + Number(entry.corrections || 0), 0);
  const requests = values.reduce((sum, entry) => sum + Number(entry.requests || 0), 0);

  memorySummary.textContent = values.length
    ? `${values.length} local entries · ${confirmations} confirmations · ${corrections} corrections · ${requests} requests`
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

function normalizeSettings(settings = {}) {
  const endpoint = normalizeEndpoint(settings.communityEndpoint);
  const gazetteer = normalizeEndpoint(settings.gazetteerEndpoint);
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    onlineByDefault: Boolean(settings.onlineByDefault),
    showOverlay: settings.showOverlay !== false,
    gazetteerEndpoint: gazetteer,
    gazetteerEnabled: Boolean(settings.gazetteerEnabled && gazetteer),
    communityEndpoint: endpoint,
    communitySyncEnabled: Boolean(settings.communitySyncEnabled && endpoint)
  };
}

async function settingsFromControls() {
  return settingsWithEndpointPermission({
    onlineByDefault: onlineDefault.checked,
    showOverlay: showOverlay.checked,
    gazetteerEnabled: gazetteerEnabled.checked,
    gazetteerEndpoint: normalizeEndpoint(gazetteerEndpoint.value),
    communitySyncEnabled: syncEnabled.checked,
    communityEndpoint: normalizeEndpoint(syncEndpoint.value)
  });
}

async function settingsWithEndpointPermission(value = {}) {
  let settings = normalizeSettings(value);

  if (settings.gazetteerEnabled) {
    const granted = await requestEndpointPermission(settings.gazetteerEndpoint);
    settings = {
      ...settings,
      gazetteerEnabled: Boolean(granted)
    };
  }

  if (settings.communitySyncEnabled) {
    const granted = await requestEndpointPermission(settings.communityEndpoint);
    settings = {
      ...settings,
      communitySyncEnabled: Boolean(granted)
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

function normalizeEndpoint(value) {
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
