import {
  normalizeCommunityEntries
} from "./resolver-core.js";
import {
  normalizeResultCache
} from "./result-cache.js";
import {
  normalizeApprovedEntries,
  normalizeSubmissionQueue
} from "./community-sync.js";
import {
  FORVO_API_ORIGIN
} from "./forvo-adapter.js";
import {
  createFlushSyncMessage,
  createPullApprovedMessage
} from "./message-contracts.js";
import {
  createOptionsRuntimeAdapters,
  OPTIONS_STORAGE_KEYS as STORAGE_KEYS,
  readOptionsStorage,
  removeUnusedRemotePermissions,
  requestEndpointPermission,
  sendRuntimeMessage,
  writeOptionsStorage
} from "./options/runtime-adapters.js";
import {
  approvedSummaryText as approvedSummaryLabel,
  cacheSummaryText as cacheSummaryLabel,
  isPlainObject,
  memorySummaryText,
  summarizeQueue,
  syncSummaryText as syncSummaryLabel
} from "./options/summary-view.js";
import {
  normalizeApiKey,
  normalizeCredentials,
  normalizeHttpsEndpoint as normalizeEndpoint,
  normalizeHttpsUrlTemplate,
  normalizeLanguageHints,
  normalizeLanguageCode,
  normalizeSettings,
  normalizeShortText
} from "./shared/settings.js";

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
const voiceServiceEnabled = document.getElementById("voice-service-enabled");
const voiceServiceUrlTemplate = document.getElementById("voice-service-url-template");
const voiceServiceLabel = document.getElementById("voice-service-label");
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
voiceServiceEnabled.addEventListener("change", saveSettings);
voiceServiceUrlTemplate.addEventListener("change", saveSettings);
voiceServiceLabel.addEventListener("change", saveSettings);
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
  const stored = await readOptionsStorage([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.credentials,
    STORAGE_KEYS.approvedCommunityEntries,
    STORAGE_KEYS.communityPullState,
    STORAGE_KEYS.communityEntries,
    STORAGE_KEYS.resultCache,
    STORAGE_KEYS.syncQueue,
    STORAGE_KEYS.syncSummary
  ], optionsRuntimeAdapters());
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
  voiceServiceEnabled.checked = settings.voiceServiceEnabled;
  voiceServiceUrlTemplate.value = settings.voiceServiceUrlTemplate;
  voiceServiceLabel.value = settings.voiceServiceLabel;
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
  const stored = await readOptionsStorage([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.credentials
  ], optionsRuntimeAdapters());
  const previousSettings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  const previousCredentials = normalizeCredentials(stored[STORAGE_KEYS.credentials]);
  const wantedSync = syncEnabled.checked && Boolean(normalizeEndpoint(syncEndpoint.value));
  const wantedPull = pullEnabled.checked && Boolean(normalizeEndpoint(syncEndpoint.value));
  const wantedCustomSource = customSourceEnabled.checked && Boolean(normalizeEndpoint(customSourceEndpoint.value));
  const wantedDbpedia = dbpediaEnabled.checked && Boolean(normalizeEndpoint(dbpediaEndpoint.value));
  const wantedForvo = forvoEnabled.checked && Boolean(normalizeApiKey(forvoApiKey.value));
  const wantedGazetteer = gazetteerEnabled.checked && Boolean(normalizeEndpoint(gazetteerEndpoint.value));
  const wantedVoiceService = voiceServiceEnabled.checked && Boolean(normalizeHttpsUrlTemplate(voiceServiceUrlTemplate.value));
  const credentials = credentialsFromControls();
  const settings = await settingsFromControls(credentials);
  await removeUnusedRemotePermissions(previousSettings, settings, previousCredentials, credentials, optionsRuntimeAdapters());
  await writeOptionsStorage({
    [STORAGE_KEYS.settings]: settings,
    [STORAGE_KEYS.credentials]: credentials
  }, optionsRuntimeAdapters());
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
  voiceServiceEnabled.checked = settings.voiceServiceEnabled;
  voiceServiceUrlTemplate.value = settings.voiceServiceUrlTemplate;
  voiceServiceLabel.value = settings.voiceServiceLabel;
  syncEnabled.checked = settings.communitySyncEnabled;
  pullEnabled.checked = settings.communityPullEnabled;
  syncEndpoint.value = settings.communityEndpoint;
  setStatus((settings.communitySyncEnabled || !wantedSync) &&
      (settings.communityPullEnabled || !wantedPull) &&
      (settings.customSourceEnabled || !wantedCustomSource) &&
      (settings.dbpediaEnabled || !wantedDbpedia) &&
      (settings.gazetteerEnabled || !wantedGazetteer) &&
      (settings.voiceServiceEnabled || !wantedVoiceService) &&
      (settings.forvoEnabled || !wantedForvo)
    ? "Settings saved."
    : "Settings saved. Endpoint permission was not granted.");
}

async function exportData() {
  const stored = await readOptionsStorage([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.approvedCommunityEntries,
    STORAGE_KEYS.communityPullState,
    STORAGE_KEYS.communityEntries,
    STORAGE_KEYS.resultCache,
    STORAGE_KEYS.syncQueue,
    STORAGE_KEYS.syncSummary
  ], optionsRuntimeAdapters());
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

  const stored = await readOptionsStorage([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.credentials
  ], optionsRuntimeAdapters());
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
  await removeUnusedRemotePermissions(previousSettings, settings, previousCredentials, credentials, optionsRuntimeAdapters());
  await writeOptionsStorage({
    [STORAGE_KEYS.settings]: settings,
    [STORAGE_KEYS.approvedCommunityEntries]: approvedCommunityEntries,
    [STORAGE_KEYS.communityPullState]: communityPullState,
    [STORAGE_KEYS.communityEntries]: communityEntries,
    [STORAGE_KEYS.resultCache]: resultCache,
    [STORAGE_KEYS.syncQueue]: syncQueue,
    [STORAGE_KEYS.syncSummary]: importedSyncSummary
  }, optionsRuntimeAdapters());

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
  voiceServiceEnabled.checked = settings.voiceServiceEnabled;
  voiceServiceUrlTemplate.value = settings.voiceServiceUrlTemplate;
  voiceServiceLabel.value = settings.voiceServiceLabel;
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
  await writeOptionsStorage({
    [STORAGE_KEYS.communityEntries]: {}
  }, optionsRuntimeAdapters());
  dataBox.value = "";
  renderSummary({});
  setStatus("Community memory cleared.");
}

async function clearLookupCache() {
  await writeOptionsStorage({
    [STORAGE_KEYS.resultCache]: normalizeResultCache({})
  }, optionsRuntimeAdapters());
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

  const stored = await readOptionsStorage([
    STORAGE_KEYS.approvedCommunityEntries,
    STORAGE_KEYS.communityPullState
  ], optionsRuntimeAdapters());
  renderApprovedSummary(stored[STORAGE_KEYS.approvedCommunityEntries], stored[STORAGE_KEYS.communityPullState]);
  setStatus(response.summary.skipped ? "Approved refresh is disabled." : `Refreshed ${response.summary.received || 0}.`);
}

async function clearSyncQueue() {
  await writeOptionsStorage({
    [STORAGE_KEYS.syncQueue]: [],
    [STORAGE_KEYS.syncSummary]: { queued: 0, failed: 0, exhausted: 0 }
  }, optionsRuntimeAdapters());
  renderSyncSummary({ queued: 0, failed: 0, exhausted: 0 });
  setStatus("Sync queue cleared.");
}

async function clearApprovedEntries() {
  await writeOptionsStorage({
    [STORAGE_KEYS.approvedCommunityEntries]: {},
    [STORAGE_KEYS.communityPullState]: {}
  }, optionsRuntimeAdapters());
  renderApprovedSummary({}, {});
  setStatus("Approved shared entries cleared.");
}

function renderSummary(entries) {
  memorySummary.textContent = memorySummaryText(entries);
}

function renderCacheSummary(cache) {
  cacheSummaryText.textContent = cacheSummaryLabel(cache);
}

function renderSyncSummary(summary, queue) {
  syncSummaryText.textContent = syncSummaryLabel(summary, queue);
}

function renderApprovedSummary(entries = {}, state = {}) {
  approvedSummary.textContent = approvedSummaryLabel(entries, state);
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
    voiceServiceEnabled: voiceServiceEnabled.checked,
    voiceServiceUrlTemplate: normalizeHttpsUrlTemplate(voiceServiceUrlTemplate.value),
    voiceServiceLabel: normalizeShortText(voiceServiceLabel.value),
    communitySyncEnabled: syncEnabled.checked,
    communityPullEnabled: pullEnabled.checked,
    communityEndpoint: normalizeEndpoint(syncEndpoint.value)
  }, credentials);
}

async function settingsWithEndpointPermission(value = {}, credentials = {}) {
  let settings = normalizeSettings(value);
  const normalizedCredentials = normalizeCredentials(credentials);

  if (settings.customSourceEnabled) {
    const granted = await requestEndpointPermission(settings.customSourceEndpoint, optionsRuntimeAdapters());
    settings = {
      ...settings,
      customSourceEnabled: Boolean(granted)
    };
  }

  if (settings.forvoEnabled) {
    const granted = normalizedCredentials.forvoApiKey
      ? await requestEndpointPermission(FORVO_API_ORIGIN, optionsRuntimeAdapters())
      : false;
    settings = {
      ...settings,
      forvoEnabled: Boolean(granted)
    };
  }

  if (settings.dbpediaEnabled) {
    const granted = await requestEndpointPermission(settings.dbpediaEndpoint, optionsRuntimeAdapters());
    settings = {
      ...settings,
      dbpediaEnabled: Boolean(granted)
    };
  }

  if (settings.gazetteerEnabled) {
    const granted = await requestEndpointPermission(settings.gazetteerEndpoint, optionsRuntimeAdapters());
    settings = {
      ...settings,
      gazetteerEnabled: Boolean(granted)
    };
  }

  if (settings.voiceServiceEnabled) {
    const granted = await requestEndpointPermission(settings.voiceServiceUrlTemplate, optionsRuntimeAdapters());
    settings = {
      ...settings,
      voiceServiceEnabled: Boolean(granted)
    };
  }

  if (settings.communitySyncEnabled || settings.communityPullEnabled) {
    const granted = await requestEndpointPermission(settings.communityEndpoint, optionsRuntimeAdapters());
    settings = {
      ...settings,
      communitySyncEnabled: Boolean(settings.communitySyncEnabled && granted),
      communityPullEnabled: Boolean(settings.communityPullEnabled && granted)
    };
  }

  return settings;
}

function setStatus(value) {
  statusText.textContent = value;
}

function sendMessage(message) {
  return sendRuntimeMessage(message, optionsRuntimeAdapters());
}

function optionsRuntimeAdapters() {
  return createOptionsRuntimeAdapters();
}
