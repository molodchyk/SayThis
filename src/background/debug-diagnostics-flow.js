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
const RECENT_EVENT_LIMIT = 120;

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
  const events = debugEvents(dependencies);

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
        forvoApiKeyPresent: Boolean(credentials.forvoApiKey)
      }
    },
    settings: settingsSummary(settings),
    lastResult: summarizeResultForDebug(lastResult),
    speechPlan,
    offscreenSpeech,
    playback: playbackSummary(lastResult),
    timing: playbackTimingSummary(events),
    recentEvents: recentEvents(events)
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
    selectToHear: settings.selectToHear,
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

function debugEvents(dependencies = {}) {
  const events = dependencies.getDebugEvents?.();
  return Array.isArray(events) ? events : [];
}

function recentEvents(events = []) {
  return events.slice(-RECENT_EVENT_LIMIT);
}

function playbackTimingSummary(events = []) {
  const groups = new Map();
  for (const event of events) {
    const id = normalizeSelection(event?.trace?.id);
    if (!id) {
      continue;
    }

    const group = groups.get(id) || [];
    group.push(event);
    groups.set(id, group);
  }

  const latest = selectLatestTimingGroup([...groups.values()]);
  if (!latest?.length) {
    return null;
  }

  const trace = latest[0].trace || {};
  const trigger = latest.find((event) => String(event.kind || "").startsWith("ui:"));
  const prepareStart = latest.find((event) => event.kind === "audio-prepare:start");
  const prepareResult = latestEvent(latest, [
    "audio-prepare:result",
    "audio-prepare:error"
  ]);
  const resolveStart = latest.find((event) => event.kind === "resolve:start");
  const resolveResult = latestEvent(latest, [
    "resolve:result",
    "resolve:error"
  ]);
  const sharedAudioStart = latest.find((event) => event.kind === "shared-audio:start");
  const sharedAudioResult = latestEvent(latest, [
    "shared-audio:result",
    "shared-audio:error"
  ]);
  const playbackStart = latest.find((event) => event.kind === "playback:start");
  const playbackResult = latestEvent(latest, [
    "playback:result",
    "playback:error"
  ]);
  const audioRequest = latest.find((event) => event.kind === "audio:start");
  const audioResult = latestEvent(latest, [
    "audio:result",
    "audio:error"
  ]);
  const speechStart = latest.find((event) => event.kind === "speech:start");
  const speechResult = latestEvent(latest, [
    "speech:result",
    "speech:error"
  ]);
  const audioStart = latest.find((event) => [
    "audio:popup-start",
    "audio:overlay-start",
    "audio:offscreen-response",
    "offscreen-audio:result",
    "audio:result"
  ].includes(event.kind));
  const last = latest[latest.length - 1];
  const storedHit = latest.find((event) => event.kind === "stored-result:hit");
  const storedMiss = latestEvent(latest, ["stored-result:miss"]);
  const onlineRefresh = latestEvent(latest, [
    "online-refresh:result",
    "online-refresh:error"
  ]);
  const contextCandidates = latest
    .filter((event) => String(event.kind || "").startsWith("context-candidate:"));

  return {
    traceId: normalizeSelection(trace.id),
    source: normalizeSelection(trace.source),
    action: normalizeSelection(trace.action),
    triggerKind: normalizeSelection(trigger?.kind),
    triggerMs: numberOrNull(trigger?.sinceTraceStartMs),
    prepareStartMs: numberOrNull(prepareStart?.sinceTraceStartMs),
    prepareReadyMs: numberOrNull(prepareResult?.sinceTraceStartMs),
    prepareElapsedMs: numberOrNull(prepareResult?.elapsedMs),
    resolveStartMs: numberOrNull(resolveStart?.sinceTraceStartMs),
    resolveResultMs: numberOrNull(resolveResult?.sinceTraceStartMs),
    resolveElapsedMs: numberOrNull(resolveResult?.elapsedMs),
    sharedAudioStartMs: numberOrNull(sharedAudioStart?.sinceTraceStartMs),
    sharedAudioResultMs: numberOrNull(sharedAudioResult?.sinceTraceStartMs),
    sharedAudioElapsedMs: numberOrNull(sharedAudioResult?.elapsedMs),
    playbackStartMs: numberOrNull(playbackStart?.sinceTraceStartMs),
    playbackResultMs: numberOrNull(playbackResult?.sinceTraceStartMs),
    playbackElapsedMs: numberOrNull(playbackResult?.elapsedMs),
    playbackMode: normalizeSelection(playbackResult?.mode),
    playbackError: normalizeSelection(playbackResult?.error),
    audioRequestMs: numberOrNull(audioRequest?.sinceTraceStartMs),
    audioResultMs: numberOrNull(audioResult?.sinceTraceStartMs),
    audioElapsedMs: numberOrNull(audioResult?.elapsedMs),
    speechStartMs: numberOrNull(speechStart?.sinceTraceStartMs),
    speechResultMs: numberOrNull(speechResult?.sinceTraceStartMs),
    speechElapsedMs: numberOrNull(speechResult?.elapsedMs),
    audioStartMs: numberOrNull(audioStart?.sinceTraceStartMs),
    onlineRefreshMs: numberOrNull(onlineRefresh?.sinceTraceStartMs),
    onlineRefreshElapsedMs: numberOrNull(onlineRefresh?.elapsedMs),
    storedResultHit: Boolean(storedHit),
    storedResultMiss: Boolean(storedMiss),
    storedResultMissReason: normalizeSelection(storedMiss?.reason),
    contextCandidates: contextCandidates.map(summarizeContextCandidateEvent),
    lastEventMs: numberOrNull(last?.sinceTraceStartMs),
    eventCount: latest.length,
    events: latest.map((event) => ({
      kind: normalizeSelection(event.kind),
      sinceTraceStartMs: numberOrNull(event.sinceTraceStartMs),
      elapsedMs: numberOrNull(event.elapsedMs),
      candidate: candidateName(event),
      hit: typeof event.hit === "boolean" ? event.hit : undefined,
      selected: normalizeSelection(event.selected),
      cacheMode: normalizeSelection(event.cacheMode),
      urlHost: normalizeSelection(event.urlHost),
      sourceStatus: normalizeSelection(event.sourceStatus),
      audioQuality: normalizeSelection(event.audioQuality),
      mode: normalizeSelection(event.mode),
      reason: normalizeSelection(event.reason),
      storedDisplay: normalizeSelection(event.storedDisplay),
      error: normalizeSelection(event.error)
    }))
  };
}

function summarizeContextCandidateEvent(event = {}) {
  return {
    kind: normalizeSelection(event.kind),
    candidate: candidateName(event),
    sinceTraceStartMs: numberOrNull(event.sinceTraceStartMs),
    elapsedMs: numberOrNull(event.elapsedMs),
    hit: typeof event.hit === "boolean" ? event.hit : undefined,
    selected: normalizeSelection(event.selected),
    reason: normalizeSelection(event.reason),
    sourceStatus: normalizeSelection(event.sourceStatus),
    audioQuality: normalizeSelection(event.audioQuality),
    urlHost: normalizeSelection(event.urlHost),
    error: normalizeSelection(event.error)
  };
}

function selectLatestTimingGroup(groups = []) {
  const sorted = groups
    .filter((group) => Array.isArray(group) && group.length)
    .sort((left, right) => eventTime(lastEvent(right)?.at) - eventTime(lastEvent(left)?.at));
  return sorted.find(isUserPlaybackGroup) || sorted[0];
}

function isUserPlaybackGroup(events = []) {
  return events.some((event) => String(event?.kind || "").startsWith("ui:"));
}

function candidateName(event = {}) {
  const kind = normalizeSelection(event.kind);
  return kind.startsWith("context-candidate:")
    ? kind.replace(/^context-candidate:/, "").replace(/-(?:start|result|skip)$/, "")
    : "";
}

function lastEvent(events = []) {
  return events[events.length - 1] || null;
}

function latestEvent(events = [], kinds = []) {
  const kindSet = new Set(kinds);
  return events.findLast?.((event) => kindSet.has(event.kind)) ||
    [...events].reverse().find((event) => kindSet.has(event.kind));
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

function eventTime(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}
