import {
  getBestAudio,
  hasPreferredAudio,
  hasTopTierAudio,
  normalizeSelection,
  resultToSpeechOptions
} from "../resolver-core.js";
import {
  normalizeApprovedEntries,
  normalizeSubmissionQueue
} from "../community-sync.js";
import {
  normalizeResultCache
} from "../result/cache.js";
import {
  isSharedAudioCandidate
} from "../result/shared-audio.js";
import {
  normalizeCredentials,
  normalizeSettings
} from "../shared/settings.js";
import {
  normalizeVoiceLocale,
  preferredVoiceScoreForLabel,
  voiceLocaleMatchesRequest
} from "../shared/voice-preferences.js";
import {
  selectTtsVoiceName
} from "./playback-surface-flow.js";

const DEFAULT_STORAGE_KEYS = {
  approvedCommunityEntries: "approvedCommunityEntries",
  communityEntries: "communityEntries",
  communityPullState: "communityPullState",
  credentials: "credentials",
  lastResult: "lastResult",
  lastSelection: "lastSelection",
  lastSource: "lastSource",
  resultCache: "resultCache",
  syncQueue: "syncQueue",
  syncSummary: "syncSummary",
  settings: "settings"
};

export async function buildDebugDiagnostics(dependencies = {}) {
  const storageKeys = {
    ...DEFAULT_STORAGE_KEYS,
    ...(dependencies.storageKeys || {})
  };
  const stored = await dependencies.getStorage?.(Object.values(storageKeys)) || {};
  const settings = normalizeSettings(stored[storageKeys.settings]);
  const credentials = normalizeCredentials(stored[storageKeys.credentials]);
  const lastResult = isPlainObject(stored[storageKeys.lastResult])
    ? stored[storageKeys.lastResult]
    : null;
  const voices = await readTtsVoices(dependencies);
  const speechPlan = speechPlanFor(lastResult, voices);
  const offscreenSpeech = await offscreenSpeechDiagnostics(dependencies, speechPlan?.lang);
  const approvedEntries = normalizeApprovedEntries({
    entries: stored[storageKeys.approvedCommunityEntries]
  });
  const queue = normalizeSubmissionQueue(stored[storageKeys.syncQueue]);
  const cache = normalizeResultCache(stored[storageKeys.resultCache]);

  return {
    generatedAt: nowIso(dependencies),
    extension: extensionSummary(dependencies),
    storage: {
      lastSelection: normalizeSelection(stored[storageKeys.lastSelection]),
      lastSource: normalizeSelection(stored[storageKeys.lastSource]),
      hasLastResult: Boolean(lastResult),
      communityEntryCount: countKeys(stored[storageKeys.communityEntries]),
      approvedEntryCount: countKeys(approvedEntries),
      resultCacheEntryCount: countKeys(cache.entries),
      syncQueueCount: queue.length,
      credentials: {
        forvoApiKeyPresent: Boolean(credentials.forvoApiKey),
        sharedAudioGenerationTokenPresent: Boolean(credentials.sharedAudioGenerationToken)
      }
    },
    settings: settingsSummary(settings),
    lastResult: summarizeResultForDebug(lastResult),
    speechPlan,
    offscreenSpeech,
    playback: playbackSummary(lastResult),
    recentEvents: recentEvents(dependencies)
  };
}

export function summarizeResultForDebug(result = null) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const audioItems = Array.isArray(result.pronunciation?.audio)
    ? result.pronunciation.audio.map(summarizeAudioForDebug).filter(Boolean)
    : [];

  return {
    query: normalizeSelection(result.query),
    display: normalizeSelection(result.display),
    sourceForm: normalizeSelection(result.sourceForm),
    speakText: normalizeSelection(result.speakText),
    language: normalizeSelection(result.language),
    languageName: normalizeSelection(result.languageName),
    ttsLang: normalizeSelection(result.ttsLang),
    sourceStatus: normalizeSelection(result.sourceStatus),
    sourceLabel: normalizeSelection(result.sourceLabel),
    confidence: normalizeSelection(result.confidence),
    simpleGuide: normalizeSelection(result.pronunciation?.simple),
    ipa: normalizeSelection(result.pronunciation?.ipa),
    audioCount: audioItems.length,
    audio: audioItems.slice(0, 8)
  };
}

export function summarizeAudioForDebug(audio = null) {
  if (!audio?.url) {
    return null;
  }

  return {
    label: normalizeSelection(audio.label),
    source: normalizeSelection(audio.source),
    quality: normalizeSelection(audio.quality),
    url: normalizeSelection(audio.url).slice(0, 240)
  };
}

export function summarizeSpeechForDebug(speech = null) {
  if (!speech || typeof speech !== "object") {
    return null;
  }

  return {
    spoken: speech.spoken !== false,
    text: normalizeSelection(speech.text),
    fallback: normalizeSelection(speech.fallback),
    error: normalizeSelection(speech.error),
    options: {
      lang: normalizeSelection(speech.options?.lang),
      voiceName: normalizeSelection(speech.options?.voiceName),
      rate: speech.options?.rate
    }
  };
}

function speechPlanFor(result, voices = []) {
  if (!result) {
    return null;
  }

  const speech = resultToSpeechOptions(result, { rate: 0.82 });
  const lang = normalizeSelection(speech.options.lang);
  const selectedVoice = selectTtsVoiceName(voices, lang);
  const matchingVoices = voicesForLanguage(voices, lang);

  return {
    text: speech.text,
    lang,
    rate: speech.options.rate,
    selectedVoice,
    hasSelectedVoice: Boolean(selectedVoice),
    matchingVoiceCount: matchingVoices.length,
    totalVoiceCount: voices.length,
    matchingVoices: matchingVoices.slice(0, 20)
  };
}

function playbackSummary(result) {
  if (!result) {
    return null;
  }

  return {
    bestAudio: summarizeAudioForDebug(getBestAudio(result)),
    hasPreferredAudio: hasPreferredAudio(result),
    hasTopTierAudio: hasTopTierAudio(result),
    sharedAudioCandidate: isSharedAudioCandidate(result, result.query || result.display)
  };
}

async function readTtsVoices(dependencies = {}) {
  try {
    const voices = await dependencies.getTtsVoices?.();
    return Array.isArray(voices)
      ? voices.map(normalizeVoice).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

async function offscreenSpeechDiagnostics(dependencies = {}, lang = "") {
  if (typeof dependencies.getOffscreenDebugState !== "function") {
    return null;
  }

  try {
    return await dependencies.getOffscreenDebugState(lang);
  } catch (error) {
    return {
      supported: false,
      error: normalizeSelection(error?.message || "Offscreen diagnostics failed.")
    };
  }
}

function normalizeVoice(voice = {}) {
  const voiceName = normalizeSelection(voice.voiceName);
  const lang = normalizeVoiceLocale(voice.lang);
  if (!voiceName && !lang) {
    return null;
  }

  return {
    voiceName,
    lang,
    remote: Boolean(voice.remote),
    extensionId: normalizeSelection(voice.extensionId)
  };
}

function voicesForLanguage(voices = [], lang = "") {
  return voices
    .filter((voice) => voiceLocaleMatchesRequest(voice.lang, lang))
    .map((voice) => ({
      ...voice,
      preferredScore: preferredVoiceScoreForLabel(voice.voiceName, lang)
    }))
    .sort((left, right) =>
      right.preferredScore - left.preferredScore ||
      Number(right.remote) - Number(left.remote) ||
      left.voiceName.localeCompare(right.voiceName));
}

function settingsSummary(settings = {}) {
  return {
    onlineByDefault: settings.onlineByDefault,
    showOverlay: settings.showOverlay,
    autoSpeakPopup: settings.autoSpeakPopup,
    lookupLanguageHints: settings.lookupLanguageHints,
    customSourceEnabled: settings.customSourceEnabled,
    customSourceEndpoint: settings.customSourceEndpoint,
    dbpediaEnabled: settings.dbpediaEnabled,
    dbpediaEndpoint: settings.dbpediaEndpoint,
    forvoEnabled: settings.forvoEnabled,
    forvoLanguage: settings.forvoLanguage,
    gazetteerEnabled: settings.gazetteerEnabled,
    gazetteerEndpoint: settings.gazetteerEndpoint,
    communityAudioEnabled: settings.communityAudioEnabled,
    communitySyncEnabled: settings.communitySyncEnabled,
    communityPullEnabled: settings.communityPullEnabled,
    communityEndpoint: settings.communityEndpoint
  };
}

function extensionSummary(dependencies = {}) {
  const manifest = dependencies.getManifest?.() || {};
  return {
    name: normalizeSelection(manifest.name),
    version: normalizeSelection(manifest.version),
    manifestVersion: manifest.manifest_version || manifest.manifestVersion || null
  };
}

function recentEvents(dependencies = {}) {
  const events = dependencies.getDebugEvents?.();
  return Array.isArray(events) ? events.slice(-30) : [];
}

function countKeys(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).length
    : 0;
}

function nowIso(dependencies = {}) {
  return typeof dependencies.now === "function"
    ? new Date(dependencies.now()).toISOString()
    : new Date().toISOString();
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
