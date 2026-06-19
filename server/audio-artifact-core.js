export const DEFAULT_MAX_AUDIO_BYTES = 512 * 1024;
export const AUDIO_CACHE_CONTROL = "public, max-age=31536000, immutable";

export function publicAudioArtifact(artifact = {}) {
  if (!artifact?.id) {
    return null;
  }

  return {
    id: artifact.id,
    term: artifact.term,
    lookupKey: artifact.lookupKey,
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
    provider: artifact.provider,
    mimeType: artifact.mimeType,
    byteLength: artifact.byteLength,
    sha256: artifact.sha256,
    audioUrl: artifact.audioUrl,
    sourceUrl: artifact.sourceUrl,
    variantNote: artifact.variantNote,
    trustSignals: artifact.trustSignals
  };
}

export function publicAudioUrl(options = {}) {
  if (options.audioPublicBaseUrl && options.storageKey) {
    const base = normalizePublicBaseEndpoint(options.audioPublicBaseUrl);
    if (base) {
      return new URL(options.storageKey, ensureTrailingSlash(base)).toString();
    }
  }

  const base = normalizePublicBaseEndpoint(options.publicBaseUrl);
  return base && options.id
    ? new URL(`/audio/${encodeURIComponent(options.id)}`, base).toString()
    : "";
}

export function audioStorageKey(hash, mimeType) {
  const normalizedHash = normalizeHash(hash);
  const normalizedMimeType = normalizeAudioMimeType(mimeType);
  return normalizedHash && normalizedMimeType
    ? `audio/sha256/${normalizedHash}.${audioExtension(normalizedMimeType)}`
    : "";
}

export function normalizeAudioStorageKey(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .match(/^audio\/sha256\/[a-f0-9]{64}\.(?:mp3|ogg|wav|webm|m4a)$/)?.[0] || "";
}

export function normalizeAudioMimeType(value) {
  const mime = String(value || "").trim().toLowerCase();
  return [
    "audio/mpeg",
    "audio/mp3",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/mp4"
  ].includes(mime) ? mime : "";
}

export function normalizePublicBaseEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || isLocalHttpEndpoint(url)) {
      return url.toString();
    }
  } catch {
    return "";
  }

  return "";
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

function audioExtension(mimeType) {
  if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") {
    return "mp3";
  }
  if (mimeType === "audio/ogg") {
    return "ogg";
  }
  if (mimeType === "audio/wav") {
    return "wav";
  }
  if (mimeType === "audio/webm") {
    return "webm";
  }
  if (mimeType === "audio/mp4") {
    return "m4a";
  }

  return "bin";
}

function normalizeHash(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .match(/^[a-f0-9]{64}$/)?.[0] || "";
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function isLocalHttpEndpoint(url) {
  return url?.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
}
