import {
  createLookupKey,
  normalizeSelection
} from "../src/resolver-core.js";
import { normalizeAudioMimeType } from "./community-audio-artifacts.js";

export function upsertGeneratedAudioArtifact(store, artifact, now = new Date().toISOString()) {
  const normalizedStore = normalizeAudioStore(store);
  const normalizedArtifact = normalizeAudioArtifact(artifact, now);
  if (!normalizedArtifact.id) {
    return {
      store: normalizedStore,
      accepted: false,
      reason: "invalid-audio-artifact"
    };
  }

  const entry = approvedEntryFromGeneratedAudio(normalizedArtifact, now);

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
  const mimeType = normalizeAudioMimeType(value.mimeType);
  const byteLength = clampNumber(value.byteLength, 1, 2_000_000);
  const audioUrl = normalizeHttpsUrl(value.audioUrl);

  if (!id || !term || !lookupKey || !dataBase64 || !mimeType || !byteLength || !audioUrl) {
    return {};
  }

  return {
    id,
    term,
    lookupKey,
    sourceForm: normalizeSelection(value.sourceForm || term),
    language: normalizeSelection(value.language),
    ttsLang: normalizeSelection(value.ttsLang),
    provider: normalizeSelection(value.provider || "voice-service"),
    mimeType,
    byteLength,
    sha256: normalizeHash(value.sha256),
    dataBase64,
    audioUrl,
    sourceUrl: normalizeHttpsUrl(value.sourceUrl),
    createdAt: normalizeSelection(value.createdAt) || now,
    updatedAt: normalizeSelection(value.updatedAt) || now
  };
}

function approvedEntryFromGeneratedAudio(artifact, now) {
  return {
    term: artifact.term,
    lookupKey: artifact.lookupKey,
    confirmations: 0,
    corrections: 0,
    flags: 0,
    requests: 0,
    sourceForm: artifact.sourceForm,
    aliases: [],
    language: artifact.language,
    languageName: "",
    origin: "",
    root: "",
    domainHint: "",
    variants: [],
    ipa: "",
    simple: "",
    audioUrl: artifact.audioUrl,
    sourceUrl: artifact.sourceUrl,
    variantNote: "",
    trustSignals: [
      "moderator-reviewed",
      "generated-audio",
      "audio-backed"
    ],
    approvedAt: now,
    updatedAt: now
  };
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

function clampNumber(value, min, max) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}
