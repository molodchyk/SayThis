import {
  DEFAULT_MAX_AUDIO_BYTES,
  publicAudioArtifact
} from "./community-audio-artifacts.js";
import {
  approvedAudioEntryForRequest,
  upsertGeneratedAudioArtifact
} from "./community-audio-store.js";
import {
  generatedAudioArtifactFromTts
} from "./tts-provider.js";
import {
  hasUsefulSharedAudioTarget
} from "../src/result/shared-audio.js";
import {
  normalizeSelection
} from "../src/resolver-core.js";

const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

export async function handleSharedAudioRequest(request, store, options = {}) {
  const maxBodyBytes = normalizePositiveInteger(options.maxBodyBytes, DEFAULT_MAX_BODY_BYTES);
  if (bodyByteLength(request.body) > maxBodyBytes) {
    return response(413, store, { error: "body-too-large" });
  }

  const body = parseJsonBody(request.body);
  const existingEntry = approvedAudioEntryForRequest(store, body);
  if (existingEntry) {
    return response(200, store, {
      accepted: true,
      reused: true,
      generated: false,
      entry: existingEntry
    });
  }

  if (!options.publicAudioGenerationEnabled) {
    return response(404, store, { error: "shared-audio-not-found" });
  }

  if (!isUsefulGenerationRequest(body)) {
    return response(400, store, { error: "invalid-shared-audio-target" });
  }

  const auth = typeof options.authorizeGeneration === "function"
    ? options.authorizeGeneration(request)
    : { ok: true };
  if (!auth.ok) {
    return response(auth.status || 401, store, { error: auth.error || "unauthorized" });
  }

  const rate = typeof options.checkRateLimit === "function"
    ? options.checkRateLimit(request)
    : { ok: true };
  if (!rate.ok) {
    return response(429, store, {
      error: "rate-limited",
      retryAfterMs: rate.retryAfterMs
    });
  }

  const artifact = await generatedAudioArtifactFromTts(body, {
    maxAudioBytes: normalizePositiveInteger(options.maxAudioBytes, DEFAULT_MAX_AUDIO_BYTES),
    publicBaseUrl: options.publicBaseUrl,
    ttsProvider: options.ttsProvider
  });
  if (!artifact.ok) {
    return response(artifact.status, store, { error: artifact.error });
  }

  const result = upsertGeneratedAudioArtifact(store, artifact.value, new Date().toISOString(), {
    reviewed: false
  });
  return response(result.accepted ? 200 : 400, result.store, {
    accepted: result.accepted,
    reused: false,
    generated: true,
    reason: result.reason || "",
    artifact: publicAudioArtifact(result.artifact),
    entry: result.entry || null,
    voice: artifact.voice || null
  });
}

function response(status, store, body) {
  return { status, store, body };
}

function parseJsonBody(body) {
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function isUsefulGenerationRequest(body = {}) {
  const selectedText = normalizeSelection(body.term || body.display || body.lookupKey);
  const sourceForm = normalizeSelection(body.sourceForm || body.text);
  const language = normalizeSelection(body.language);
  const ttsLang = normalizeSelection(body.ttsLang || language);
  return Boolean(
    selectedText &&
    sourceForm &&
    ttsLang &&
    hasUsefulSharedAudioTarget(selectedText, sourceForm, language, ttsLang)
  );
}

function bodyByteLength(body) {
  return Buffer.byteLength(String(body || ""), "utf8");
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return Math.floor(number);
}
