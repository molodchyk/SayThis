import { createHash } from "node:crypto";
import {
  languageCodeFromLanguage,
  normalizeTtsLanguage
} from "../src/resolver/language.js";
import {
  audioStorageKey,
  DEFAULT_MAX_AUDIO_BYTES,
  normalizeAudioMimeType,
  publicAudioUrl
} from "./audio-artifact-core.js";

export {
  DEFAULT_MAX_AUDIO_BYTES,
  normalizeAudioMimeType,
  normalizeHttpsEndpoint,
  normalizePublicBaseEndpoint,
  publicAudioArtifact
} from "./audio-artifact-core.js";

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
  const storageKey = audioStorageKey(hash, mimeType);
  const audioUrl = publicAudioUrl({
    publicBaseUrl: options.publicBaseUrl,
    audioPublicBaseUrl: options.audioPublicBaseUrl,
    id,
    storageKey
  });
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
      storageKey,
      dataBase64: buffer.toString("base64"),
      audioUrl,
      sourceUrl: body.sourceUrl,
      variantNote: body.variantNote,
      trustSignals: body.trustSignals
    }
  };
}

function normalizeLanguage(language) {
  return languageCodeFromLanguage(language) || String(language || "").trim();
}

function decodeBase64Audio(value) {
  const raw = String(value || "").replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, "").replace(/\s+/g, "");
  if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    return Buffer.alloc(0);
  }

  return Buffer.from(raw, "base64");
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
