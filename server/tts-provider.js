import { generatedAudioArtifactFromBody } from "./community-audio-artifacts.js";
import {
  normalizeTtsLanguage
} from "../src/resolver/language.js";
import {
  normalizeVoiceLocale,
  preferredVoiceNamesForLocale,
  voiceLocaleMatchesRequest
} from "../src/shared/voice-preferences.js";

const DEFAULT_GOOGLE_TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const DEFAULT_AUDIO_ENCODING = "MP3";
const DEFAULT_SPEAKING_RATE = 0.82;
const MAX_TTS_TEXT_LENGTH = 240;

export function createConfiguredTtsProvider(options = {}) {
  return createGoogleTtsProvider(options);
}

export function createGoogleTtsProvider(options = {}) {
  const accessToken = normalizeToken(options.accessToken);
  const endpoint = normalizeEndpoint(options.endpoint) || DEFAULT_GOOGLE_TTS_ENDPOINT;
  const defaultVoiceName = normalizeVoiceName(options.defaultVoiceName);
  const audioEncoding = normalizeAudioEncoding(options.audioEncoding) || DEFAULT_AUDIO_ENCODING;
  const fetchImpl = options.fetch || globalThis.fetch?.bind(globalThis);

  return {
    name: "google-cloud-tts",
    configured: Boolean(accessToken && typeof fetchImpl === "function"),
    async synthesize(request = {}) {
      if (!accessToken || typeof fetchImpl !== "function") {
        return { ok: false, status: 503, error: "tts-provider-not-configured" };
      }

      const text = normalizeTtsText(request.text);
      const languageCode = normalizeLocale(normalizeTtsLanguage(request.ttsLang, request.language));
      if (!text || !languageCode) {
        return { ok: false, status: 400, error: "invalid-tts-request" };
      }

      const voiceName = selectGoogleVoiceName({
        languageCode,
        requestedVoiceName: request.voiceName,
        defaultVoiceName
      });
      const providerResponse = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          input: { text },
          voice: voiceName ? { languageCode, name: voiceName } : { languageCode },
          audioConfig: {
            audioEncoding,
            speakingRate: clampSpeakingRate(request.rate)
          }
        })
      });

      if (!providerResponse?.ok) {
        return {
          ok: false,
          status: Number(providerResponse?.status || 502),
          error: "tts-provider-failed"
        };
      }

      const payload = await providerResponse.json();
      const audioContent = normalizeBase64(payload?.audioContent);
      if (!audioContent) {
        return { ok: false, status: 502, error: "tts-provider-empty-audio" };
      }

      return {
        ok: true,
        provider: "google-cloud-tts",
        audio: {
          mimeType: mimeTypeForEncoding(audioEncoding),
          dataBase64: audioContent
        },
        voice: {
          languageCode,
          name: voiceName,
          audioEncoding
        }
      };
    }
  };
}

export async function generatedAudioArtifactFromTts(body = {}, options = {}) {
  const provider = options.ttsProvider;
  if (!provider || typeof provider.synthesize !== "function") {
    return { ok: false, status: 503, error: "tts-provider-not-configured" };
  }

  const text = normalizeTtsText(body.text || body.sourceForm || body.term);
  const ttsResult = await provider.synthesize({
    text,
    term: body.term,
    sourceForm: body.sourceForm,
    language: body.language,
    ttsLang: body.ttsLang,
    voiceName: body.voiceName,
    rate: body.rate
  });
  if (!ttsResult.ok) {
    return ttsResult;
  }

  const artifact = generatedAudioArtifactFromBody({
    term: body.term,
    lookupKey: body.lookupKey,
    sourceForm: body.sourceForm || text,
    aliases: body.aliases,
    language: body.language,
    ttsLang: body.ttsLang || ttsResult.voice?.languageCode,
    languageName: body.languageName,
    origin: body.origin,
    root: body.root,
    domainHint: body.domainHint,
    variants: body.variants,
    ipa: body.ipa,
    simple: body.simple,
    provider: ttsResult.voice?.name || ttsResult.provider || provider.name,
    mimeType: ttsResult.audio.mimeType,
    dataBase64: ttsResult.audio.dataBase64,
    sourceUrl: body.sourceUrl,
    variantNote: body.variantNote,
    trustSignals: body.trustSignals
  }, {
    maxAudioBytes: options.maxAudioBytes,
    publicBaseUrl: options.publicBaseUrl
  });

  return artifact.ok ? {
    ...artifact,
    voice: ttsResult.voice || null
  } : artifact;
}

export function preferredGoogleVoiceNamesForLocale(locale) {
  return preferredVoiceNamesForLocale(locale);
}

export function selectGoogleVoiceName(options = {}) {
  const languageCode = normalizeLocale(options.languageCode);
  const requested = normalizeVoiceName(options.requestedVoiceName);
  if (requested && isVoiceNameCompatibleWithLocale(requested, languageCode)) {
    return requested;
  }

  const defaultVoiceName = normalizeVoiceName(options.defaultVoiceName);
  if (defaultVoiceName && isVoiceNameCompatibleWithLocale(defaultVoiceName, languageCode)) {
    return defaultVoiceName;
  }

  return preferredGoogleVoiceNamesForLocale(languageCode)[0] || "";
}

function isVoiceNameCompatibleWithLocale(voiceName, locale) {
  const voiceLocale = localeFromGoogleVoiceName(voiceName);
  if (!voiceLocale || !locale) {
    return true;
  }

  return voiceLocaleMatchesRequest(voiceLocale, locale);
}

function localeFromGoogleVoiceName(value) {
  const match = String(value || "").match(/^([A-Za-z]{2,3}-[A-Za-z0-9]{2,8})(?:-|$)/);
  return normalizeVoiceLocale(match?.[1]);
}

function normalizeTtsText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TTS_TEXT_LENGTH);
}

function normalizeLocale(value) {
  return normalizeVoiceLocale(value);
}

function normalizeVoiceName(value) {
  return String(value || "")
    .trim()
    .replace(/_/g, "-")
    .match(/^[A-Za-z0-9-]{3,96}$/)?.[0] || "";
}

function normalizeToken(value) {
  return String(value || "").trim();
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

function normalizeAudioEncoding(value) {
  return ["MP3", "OGG_OPUS", "LINEAR16"].includes(String(value || "").trim().toUpperCase())
    ? String(value || "").trim().toUpperCase()
    : "";
}

function mimeTypeForEncoding(value) {
  const encoding = normalizeAudioEncoding(value);
  if (encoding === "OGG_OPUS") {
    return "audio/ogg";
  }
  if (encoding === "LINEAR16") {
    return "audio/wav";
  }

  return "audio/mpeg";
}

function normalizeBase64(value) {
  const raw = String(value || "").replace(/\s+/g, "");
  return raw && /^[A-Za-z0-9+/]+={0,2}$/.test(raw) ? raw : "";
}

function clampSpeakingRate(value) {
  const rate = Number(value || DEFAULT_SPEAKING_RATE);
  if (!Number.isFinite(rate)) {
    return DEFAULT_SPEAKING_RATE;
  }

  return Math.min(1.4, Math.max(0.45, rate));
}
