import { createHash } from "node:crypto";
import {
  languageCodeFromLanguage,
  normalizeTtsLanguage
} from "../src/resolver/language.js";

export const DEFAULT_MAX_AUDIO_BYTES = 512 * 1024;

export function generatedAudioArtifactFromBody(body = {}, options = {}) {
  const maxAudioBytes = normalizePositiveInteger(options.maxAudioBytes, DEFAULT_MAX_AUDIO_BYTES);
  const mimeType = normalizeAudioMimeType(body.mimeType);
  const buffer = decodeBase64Audio(body.dataBase64);
  if (!mimeType || !buffer.length) {
    return {
      ok: false,
      status: 400,
      error: "invalid-audio-artifact"
    };
  }

  if (buffer.length > maxAudioBytes) {
    return {
      ok: false,
      status: 413,
      error: "audio-too-large"
    };
  }

  const hash = sha256Hex(buffer);
  const id = `aud_${hash.slice(0, 32)}`;
  const audioUrl = publicAudioUrl(options.publicBaseUrl, id);
  if (!audioUrl) {
    return {
      ok: false,
      status: 400,
      error: "public-base-url-required"
    };
  }

  return {
    ok: true,
    value: {
      id,
      term: body.term,
      lookupKey: body.lookupKey,
      sourceForm: body.sourceForm,
      aliases: body.aliases,
      language: normalizeLanguage(body.language),
      ttsLang: normalizeTtsLanguage(body.ttsLang, body.language),
      languageName: body.languageName,
      origin: body.origin,
      root: body.root,
      domainHint: body.domainHint,
      variants: body.variants,
      ipa: body.ipa,
      simple: body.simple,
      provider: body.provider,
      mimeType,
      byteLength: buffer.length,
      sha256: hash,
      dataBase64: buffer.toString("base64"),
      audioUrl,
      sourceUrl: body.sourceUrl,
      variantNote: body.variantNote,
      trustSignals: body.trustSignals
    }
  };
}

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

function normalizeLanguage(language) {
  return languageCodeFromLanguage(language) || String(language || "").trim();
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

function decodeBase64Audio(value) {
  const raw = String(value || "").replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, "").replace(/\s+/g, "");
  if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    return Buffer.alloc(0);
  }

  return Buffer.from(raw, "base64");
}

function publicAudioUrl(publicBaseUrl, id) {
  const base = normalizePublicBaseEndpoint(publicBaseUrl);
  if (!base) {
    return "";
  }

  return new URL(`/audio/${encodeURIComponent(id)}`, base).toString();
}

function isLocalHttpEndpoint(url) {
  return url?.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return Math.floor(number);
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}
