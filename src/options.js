const STORAGE_KEYS = {
  communityEntries: "communityEntries",
  syncQueue: "syncQueue",
  syncSummary: "syncSummary",
  settings: "settings"
};
const DEFAULT_SETTINGS = {
  onlineByDefault: false,
  showOverlay: true,
  communitySyncEnabled: false,
  communityEndpoint: ""
};

const statusText = document.getElementById("status");
const onlineDefault = document.getElementById("online-default");
const showOverlay = document.getElementById("show-overlay");
const memorySummary = document.getElementById("memory-summary");
const exportButton = document.getElementById("export-data");
const importButton = document.getElementById("import-data");
const clearButton = document.getElementById("clear-memory");
const dataBox = document.getElementById("data-box");
const syncEnabled = document.getElementById("sync-enabled");
const syncEndpoint = document.getElementById("sync-endpoint");
const syncSummaryText = document.getElementById("sync-summary");
const flushSyncButton = document.getElementById("flush-sync");
const clearSyncButton = document.getElementById("clear-sync");

init();

onlineDefault.addEventListener("change", saveSettings);
showOverlay.addEventListener("change", saveSettings);
syncEnabled.addEventListener("change", saveSettings);
syncEndpoint.addEventListener("change", saveSettings);
exportButton.addEventListener("click", exportData);
importButton.addEventListener("click", importData);
clearButton.addEventListener("click", clearMemory);
flushSyncButton.addEventListener("click", flushSync);
clearSyncButton.addEventListener("click", clearSyncQueue);

async function init() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.communityEntries,
    STORAGE_KEYS.syncQueue,
    STORAGE_KEYS.syncSummary
  ]);
  const settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  onlineDefault.checked = settings.onlineByDefault;
  showOverlay.checked = settings.showOverlay;
  syncEnabled.checked = settings.communitySyncEnabled;
  syncEndpoint.value = settings.communityEndpoint;
  renderSummary(stored[STORAGE_KEYS.communityEntries] || {});
  renderSyncSummary(stored[STORAGE_KEYS.syncSummary], stored[STORAGE_KEYS.syncQueue]);
  setStatus("Settings loaded.");
}

async function saveSettings() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: {
      onlineByDefault: onlineDefault.checked,
      showOverlay: showOverlay.checked,
      communitySyncEnabled: syncEnabled.checked,
      communityEndpoint: normalizeEndpoint(syncEndpoint.value)
    }
  });
  setStatus("Settings saved.");
}

async function exportData() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.communityEntries,
    STORAGE_KEYS.syncQueue,
    STORAGE_KEYS.syncSummary
  ]);
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    settings: normalizeSettings(stored[STORAGE_KEYS.settings]),
    communityEntries: stored[STORAGE_KEYS.communityEntries] || {},
    syncQueue: stored[STORAGE_KEYS.syncQueue] || [],
    syncSummary: stored[STORAGE_KEYS.syncSummary] || {}
  };

  dataBox.value = JSON.stringify(payload, null, 2);
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

  const settings = normalizeSettings(payload.settings);
  const communityEntries = isPlainObject(payload.communityEntries) ? payload.communityEntries : {};
  const syncQueue = Array.isArray(payload.syncQueue) ? payload.syncQueue : [];
  const importedSyncSummary = summarizeQueue(syncQueue);
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: settings,
    [STORAGE_KEYS.communityEntries]: communityEntries,
    [STORAGE_KEYS.syncQueue]: syncQueue,
    [STORAGE_KEYS.syncSummary]: importedSyncSummary
  });

  onlineDefault.checked = settings.onlineByDefault;
  showOverlay.checked = settings.showOverlay;
  syncEnabled.checked = settings.communitySyncEnabled;
  syncEndpoint.value = settings.communityEndpoint;
  renderSummary(communityEntries);
  renderSyncSummary(importedSyncSummary);
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

async function flushSync() {
  const response = await sendMessage({ type: "SAYTHIS_FLUSH_SYNC" });
  if (!response.ok) {
    setStatus(response.error || "Sync failed.");
    return;
  }

  renderSyncSummary(response.summary);
  setStatus(`Sync sent ${response.summary.sent || 0}.`);
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

function renderSyncSummary(summary, queue) {
  const safe = summary || summarizeQueue(queue);

  syncSummaryText.textContent = safe.queued
    ? `${safe.queued} queued · ${safe.failed || 0} failed · ${safe.exhausted || 0} exhausted`
    : "No queued submissions.";
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
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    onlineByDefault: Boolean(settings.onlineByDefault),
    showOverlay: settings.showOverlay !== false,
    communityEndpoint: endpoint,
    communitySyncEnabled: Boolean(settings.communitySyncEnabled && endpoint)
  };
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
