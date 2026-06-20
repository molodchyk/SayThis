import {
  createLookupKey,
  normalizeSelection
} from "../../src/resolver-core.js";
import {
  languageCodeFromLanguage,
  normalizeTtsLanguage
} from "../../src/resolver/language.js";
import {
  normalizeAudioMimeType,
  normalizeAudioStorageKey
} from "./audio-artifact-core.js";

export function upsertGeneratedAudioArtifact(store, artifact, now = new Date().toISOString(), options = {}) {
  const normalizedStore = normalizeAudioStore(store);
  const normalizedArtifact = normalizeAudioArtifact(artifact, now);
  if (!normalizedArtifact.id) {
    return {
      store: normalizedStore,
      accepted: false,
      reason: "invalid-audio-artifact"
    };
  }

  const entry = approvedEntryFromGeneratedAudio(normalizedArtifact, now, options);

  return {
    store: {
      ...normalizedStore,
      updatedAt: now,
      audioArtifacts: {
        ...normalizedStore.audioArtifacts,
        [normalizedArtifact.id]: normalizedArtifact
      },
      approved: {
        ...normalizedStore.approved,
        [entry.lookupKey]: entry
      }
    },
    accepted: true,
    artifact: normalizedArtifact,
    entry
  };
}

export function audioArtifactPayload(store, artifactId) {
  const id = normalizeArtifactId(artifactId);
  return id ? normalizeAudioArtifactMap(store?.audioArtifacts)[id] || null : null;
}

export function approvedAudioEntryForRequest(store, request = {}) {
  const normalizedStore = normalizeAudioStore(store);
  const lookupKey = createLookupKey(request.lookupKey || request.term || request.display || request.sourceForm);
  if (!lookupKey) {
    return null;
  }

  const requestedLang = baseLanguage(request.ttsLang || request.language);
  const directEntry = compatibleApprovedAudioEntry(normalizedStore.approved[lookupKey], requestedLang);
  if (directEntry) {
    return directEntry;
  }

  const requestKeys = sharedAudioRequestKeys(request);
  if (!requestKeys.length) {
    return null;
  }

  return Object.values(normalizedStore.approved).find((entry) =>
    sharedAudioEntryMatchesRequest(entry, requestKeys, requestedLang)) || null;
}

function compatibleApprovedAudioEntry(entry, requestedLang) {
  if (!entry?.audioUrl) {
    return null;
  }

  const entryLang = baseLanguage(entry.ttsLang || entry.language);
  if (requestedLang && entryLang && requestedLang !== entryLang) {
    return null;
  }

  return entry;
}

function sharedAudioEntryMatchesRequest(entry, requestKeys, requestedLang) {
  const entryLang = baseLanguage(entry?.ttsLang || entry?.language);
  if (!requestedLang || !entryLang || requestedLang !== entryLang || !compatibleApprovedAudioEntry(entry, requestedLang)) {
    return false;
  }

  const entryKeys = new Set(sharedAudioEntryKeys(entry));
  return requestKeys.some((key) => entryKeys.has(key));
}

function sharedAudioRequestKeys(request = {}) {
  return uniqueLookupKeys([
    request.lookupKey,
    request.term,
    request.display,
    request.sourceForm,
    ...normalizeList(request.aliases),
    ...normalizeList(request.variants)
  ]);
}

function sharedAudioEntryKeys(entry = {}) {
  return uniqueLookupKeys([
    entry.lookupKey,
    entry.term,
    entry.display,
    entry.sourceForm,
    ...normalizeList(entry.aliases),
    ...normalizeList(entry.variants)
  ]);
}

function uniqueLookupKeys(values = []) {
  return [...new Set(values.map(createLookupKey).filter(Boolean))];
}

function normalizeList(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\n]/);

  return [...new Set(raw.map(normalizeSelection).filter(Boolean))].slice(0, 12);
}

function normalizeTrustSignals(value) {
  return normalizeList(value);
}

export function normalizeAudioArtifactMap(value = {}) {
  if (!value || typeof value !== "object") {
    return {};
  }

  const entries = Array.isArray(value)
    ? value.map((entry) => ["", entry])
    : Object.entries(value);

  return Object.fromEntries(entries
    .map(([key, artifact]) => normalizeAudioArtifact({ ...artifact, id: artifact?.id || key }))
    .filter((artifact) => artifact.id)
    .map((artifact) => [artifact.id, artifact]));
}

function normalizeAudioStore(store = {}) {
  return {
    ...store,
    approved: store?.approved && typeof store.approved === "object" ? store.approved : {},
    audioArtifacts: normalizeAudioArtifactMap(store?.audioArtifacts)
  };
}

function normalizeAudioArtifact(value = {}, now = new Date().toISOString()) {
  const id = normalizeArtifactId(value.id);
  const term = normalizeSelection(value.term || value.sourceForm);
  const lookupKey = createLookupKey(value.lookupKey || term);
  const dataBase64 = normalizeBase64(value.dataBase64);
  const storageKey = normalizeAudioStorageKey(value.storageKey);
  const mimeType = normalizeAudioMimeType(value.mimeType);
  const byteLength = clampNumber(value.byteLength, 1, 2_000_000);
  const audioUrl = normalizePublicAudioUrl(value.audioUrl);

  if (!id || !term || !lookupKey || (!dataBase64 && !storageKey) || !mimeType || !byteLength || !audioUrl) {
    return {};
  }

  return {
    id,
    term,
    lookupKey,
    sourceForm: normalizeSelection(value.sourceForm || term),
    aliases: normalizeList(value.aliases),
    language: normalizeLanguage(value.language),
    ttsLang: normalizeTtsLanguage(value.ttsLang, value.language),
    languageName: normalizeSelection(value.languageName),
    origin: normalizeSelection(value.origin),
    root: normalizeSelection(value.root),
    domainHint: normalizeSelection(value.domainHint),
    variants: normalizeList(value.variants),
    ipa: normalizeSelection(value.ipa),
    simple: normalizeSelection(value.simple),
    provider: normalizeSelection(value.provider || "generated-provider"),
    mimeType,
    byteLength,
    sha256: normalizeHash(value.sha256),
    ...(storageKey ? { storageKey } : {}),
    ...(dataBase64 ? { dataBase64 } : {}),
    audioUrl,
    sourceUrl: normalizeHttpsUrl(value.sourceUrl),
    variantNote: normalizeSelection(value.variantNote),
    trustSignals: normalizeTrustSignals(value.trustSignals),
    createdAt: normalizeSelection(value.createdAt) || now,
    updatedAt: normalizeSelection(value.updatedAt) || now
  };
}

function approvedEntryFromGeneratedAudio(artifact, now, options = {}) {
  return {
    term: artifact.term,
    lookupKey: artifact.lookupKey,
    confirmations: 0,
    corrections: 0,
    flags: 0,
    requests: 0,
    sourceForm: artifact.sourceForm,
    aliases: artifact.aliases,
    language: artifact.language,
    ttsLang: artifact.ttsLang,
    languageName: artifact.languageName,
    origin: artifact.origin,
    root: artifact.root,
    domainHint: artifact.domainHint,
    variants: artifact.variants,
    ipa: artifact.ipa,
    simple: artifact.simple,
    audioUrl: artifact.audioUrl,
    provider: artifact.provider,
    sourceUrl: artifact.sourceUrl,
    variantNote: artifact.variantNote,
    trustSignals: generatedAudioTrustSignals(artifact, options),
    sourceStatus: "generated-audio",
    approvedAt: now,
    updatedAt: now
  };
}

function generatedAudioTrustSignals(artifact = {}, options = {}) {
  const reviewed = options.reviewed !== false;
  const signals = [
    reviewed ? "moderator-reviewed" : "service-generated",
    "generated-audio",
    "audio-backed"
  ];

  if (artifact.sourceUrl) {
    signals.push("source-backed");
  }
  if (artifact.root) {
    signals.push("root-noted");
  }
  if (artifact.variantNote || artifact.variants?.length) {
    signals.push("variant-noted");
  }

  signals.push(...artifact.trustSignals.filter(isContextTrustSignal));
  return normalizeTrustSignals(signals);
}

function isContextTrustSignal(value) {
  return [
    "source-backed",
    "root-noted",
    "variant-noted",
    "domain-reviewed",
    "curator-reviewed",
    "contributor-confirmed",
    "repeated-confirmation"
  ].includes(value);
}

function normalizeArtifactId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .match(/^aud_[a-f0-9]{16,64}$/)?.[0] || "";
}

function normalizeBase64(value) {
  const raw = String(value || "").replace(/\s+/g, "");
  if (!raw || raw.length > 3_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    return "";
  }

  return raw;
}

function normalizeHash(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .match(/^[a-f0-9]{64}$/)?.[0] || "";
}

function normalizePublicAudioUrl(value) {
  const raw = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2048);
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    return url.protocol === "https:" || isLocalHttpEndpoint(url) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeHttpsUrl(value) {
  const raw = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2048);
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

function isLocalHttpEndpoint(url) {
  return url?.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
}

function baseLanguage(value) {
  return (languageCodeFromLanguage(value) || normalizeSelection(value)).toLowerCase().split(/[-_]/)[0];
}

function normalizeLanguage(language) {
  return languageCodeFromLanguage(language) || normalizeSelection(language);
}

function clampNumber(value, min, max) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}
