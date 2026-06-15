const STORAGE_KEYS = {
  communityEntries: "communityEntries",
  settings: "settings"
};
const DEFAULT_SETTINGS = {
  onlineByDefault: false,
  showOverlay: true
};

const statusText = document.getElementById("status");
const onlineDefault = document.getElementById("online-default");
const showOverlay = document.getElementById("show-overlay");
const memorySummary = document.getElementById("memory-summary");
const exportButton = document.getElementById("export-data");
const importButton = document.getElementById("import-data");
const clearButton = document.getElementById("clear-memory");
const dataBox = document.getElementById("data-box");

init();

onlineDefault.addEventListener("change", saveSettings);
showOverlay.addEventListener("change", saveSettings);
exportButton.addEventListener("click", exportData);
importButton.addEventListener("click", importData);
clearButton.addEventListener("click", clearMemory);

async function init() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.settings, STORAGE_KEYS.communityEntries]);
  const settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  onlineDefault.checked = settings.onlineByDefault;
  showOverlay.checked = settings.showOverlay;
  renderSummary(stored[STORAGE_KEYS.communityEntries] || {});
  setStatus("Settings loaded.");
}

async function saveSettings() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: {
      onlineByDefault: onlineDefault.checked,
      showOverlay: showOverlay.checked
    }
  });
  setStatus("Settings saved.");
}

async function exportData() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.settings, STORAGE_KEYS.communityEntries]);
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    settings: normalizeSettings(stored[STORAGE_KEYS.settings]),
    communityEntries: stored[STORAGE_KEYS.communityEntries] || {}
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
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: settings,
    [STORAGE_KEYS.communityEntries]: communityEntries
  });

  onlineDefault.checked = settings.onlineByDefault;
  showOverlay.checked = settings.showOverlay;
  renderSummary(communityEntries);
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

function renderSummary(entries) {
  const values = Object.values(entries || {});
  const confirmations = values.reduce((sum, entry) => sum + Number(entry.confirmations || 0), 0);
  const corrections = values.reduce((sum, entry) => sum + Number(entry.corrections || 0), 0);
  const requests = values.reduce((sum, entry) => sum + Number(entry.requests || 0), 0);

  memorySummary.textContent = values.length
    ? `${values.length} local entries · ${confirmations} confirmations · ${corrections} corrections · ${requests} requests`
    : "No local entries.";
}

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    onlineByDefault: Boolean(settings.onlineByDefault),
    showOverlay: settings.showOverlay !== false
  };
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function setStatus(value) {
  statusText.textContent = value;
}

