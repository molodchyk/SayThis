import {
  DEFAULT_SYNC_SETTINGS,
  normalizeSyncSettings
} from "../community-sync.js";

export const DEFAULT_SETTINGS = {
  onlineByDefault: false,
  showOverlay: true,
  autoSpeakPopup: true,
  lookupLanguageHints: [],
  customSourceEnabled: false,
  customSourceEndpoint: "",
  customSourceLabel: "",
  dbpediaEnabled: false,
  dbpediaEndpoint: "",
  forvoEnabled: false,
  forvoLanguage: "",
  gazetteerEnabled: false,
  gazetteerEndpoint: "",
  ...DEFAULT_SYNC_SETTINGS
};

export const DEFAULT_CREDENTIALS = {
  forvoApiKey: ""
};

export function normalizeSettings(settings = {}) {
  const syncSettings = normalizeSyncSettings(settings);
  const customSourceEndpoint = normalizeHttpsEndpoint(settings.customSourceEndpoint);
  const dbpediaEndpoint = normalizeHttpsEndpoint(settings.dbpediaEndpoint);
  const gazetteerEndpoint = normalizeHttpsEndpoint(settings.gazetteerEndpoint);
  const forvoLanguage = normalizeLanguageCode(settings.forvoLanguage);
  const lookupLanguageHints = normalizeLanguageHints(settings.lookupLanguageHints);

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    onlineByDefault: Boolean(settings.onlineByDefault),
    showOverlay: settings.showOverlay !== false,
    autoSpeakPopup: settings.autoSpeakPopup !== false,
    lookupLanguageHints,
    customSourceEndpoint,
    customSourceLabel: normalizeShortText(settings.customSourceLabel),
    customSourceEnabled: Boolean(settings.customSourceEnabled && customSourceEndpoint),
    dbpediaEndpoint,
    dbpediaEnabled: Boolean(settings.dbpediaEnabled && dbpediaEndpoint),
    forvoLanguage,
    forvoEnabled: Boolean(settings.forvoEnabled),
    gazetteerEndpoint,
    gazetteerEnabled: Boolean(settings.gazetteerEnabled && gazetteerEndpoint),
    ...syncSettings
  };
}

export function normalizeCredentials(credentials = {}) {
  return {
    ...DEFAULT_CREDENTIALS,
    forvoApiKey: normalizeApiKey(credentials.forvoApiKey)
  };
}

export function onlineCacheScope(settings, credentials = {}) {
  const safeSettings = normalizeSettings(settings);
  const safeCredentials = normalizeCredentials(credentials);

  return [
    safeSettings.lookupLanguageHints.length ? `wikidata ${safeSettings.lookupLanguageHints.join(",")}` : "",
    safeSettings.customSourceEnabled && safeSettings.customSourceEndpoint ? `custom ${safeSettings.customSourceEndpoint}` : "",
    safeSettings.dbpediaEnabled && safeSettings.dbpediaEndpoint ? `dbpedia ${safeSettings.dbpediaEndpoint}` : "",
    safeSettings.gazetteerEnabled && safeSettings.gazetteerEndpoint ? `gazetteer ${safeSettings.gazetteerEndpoint}` : "",
    safeSettings.forvoEnabled && safeCredentials.forvoApiKey ? `forvo ${safeSettings.forvoLanguage || "all"}` : ""
  ].filter(Boolean).join(" ");
}

export function normalizeHttpsEndpoint(value) {
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

export function normalizeApiKey(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

export function normalizeShortText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function normalizeLanguageCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .match(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/)?.[0] || "";
}

export function normalizeLanguageHints(value, options = {}) {
  const limit = Number(options.limit || 8);
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(/[\s,;]+/);
  const seen = new Set();
  const hints = [];

  for (const item of values) {
    const code = normalizeLanguageCode(item).split("-")[0];
    if (!code || seen.has(code)) {
      continue;
    }

    seen.add(code);
    hints.push(code);
    if (hints.length >= limit) {
      break;
    }
  }

  return hints;
}
