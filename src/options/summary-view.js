import {
  resultCacheSummary
} from "../result/cache.js";

export function memorySummaryText(entries = {}) {
  const values = Object.values(entries || {});
  const confirmations = values.reduce((sum, entry) => sum + Number(entry.confirmations || 0), 0);
  const corrections = values.reduce((sum, entry) => sum + Number(entry.corrections || 0), 0);
  const requests = values.reduce((sum, entry) => sum + Number(entry.requests || 0), 0);
  const flags = values.reduce((sum, entry) => sum + Number(entry.flags || 0), 0);

  return values.length
    ? `${values.length} local entries · ${confirmations} confirmations · ${corrections} corrections · ${requests} requests · ${flags} wrong-result flags`
    : "No local entries.";
}

export function cacheSummaryText(cache, formatDate = defaultFormatDate) {
  const summary = resultCacheSummary(cache);

  return summary.count
    ? `${summary.count} cached lookup${summary.count === 1 ? "" : "s"}${summary.newestAt ? ` · updated ${formatDate(summary.newestAt)}` : ""}`
    : "No cached lookups.";
}

export function syncSummaryText(summary, queue) {
  const safe = summary || summarizeQueue(queue);

  return safe.queued
    ? `${safe.queued} queued · ${safe.failed || 0} failed · ${safe.exhausted || 0} exhausted`
    : "No queued submissions.";
}

export function approvedSummaryText(entries = {}, state = {}, formatDate = defaultFormatDate) {
  const count = Object.keys(entries || {}).length;

  return count
    ? `${count} approved shared entries${state?.pulledAt ? ` · updated ${formatDate(state.pulledAt)}` : ""}`
    : "No approved shared entries.";
}

export function debugSummaryText(diagnostics = {}) {
  const timing = diagnostics.timing || {};
  if (Number.isFinite(Number(timing.audioStartMs))) {
    const audioMs = Math.round(Number(timing.audioStartMs));
    const refreshMs = Math.round(Number(timing.onlineRefreshMs));
    const refreshText = Number.isFinite(refreshMs) && refreshMs > audioMs + 250
      ? `; online refresh finished in ${refreshMs} ms`
      : "";
    const sourceText = timing.storedResultHit ? " from stored audio" : "";
    const detailText = timingDetailText(timing);
    return `Last audio started${sourceText} in ${audioMs} ms${detailText}${refreshText}.`;
  }

  if (!diagnostics.lastResult) {
    return "No resolved result has been stored yet.";
  }

  const speech = diagnostics.speechPlan || {};
  if (!speech.lang) {
    return "Last result has no resolved speech locale.";
  }

  if (!speech.totalVoiceCount) {
    return "No browser voices were reported.";
  }

  if (!speech.hasSelectedVoice) {
    return missingVoiceSummary(diagnostics, speech.lang);
  }

  return `Voice ready: ${speech.selectedVoice}.`;
}

function timingDetailText(timing = {}) {
  const parts = [
    ["setup", timing.prepareElapsedMs],
    ["resolve", timing.resolveElapsedMs],
    ["shared audio", timing.sharedAudioElapsedMs],
    ["play", timing.audioElapsedMs]
  ]
    .map(([label, value]) => {
      const number = Math.round(Number(value));
      return Number.isFinite(number) ? `${label} ${number} ms` : "";
    })
    .filter(Boolean);

  return parts.length ? ` (${parts.join("; ")})` : "";
}

export function summarizeQueue(queue) {
  return {
    queued: Array.isArray(queue) ? queue.length : 0,
    failed: Array.isArray(queue) ? queue.filter((item) => item.lastError).length : 0,
    exhausted: Array.isArray(queue) ? queue.filter((item) => item.attempts >= 5).length : 0
  };
}

export function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function defaultFormatDate(value) {
  return new Date(value).toLocaleString();
}

function missingVoiceSummary(diagnostics = {}, lang = "") {
  const offscreen = diagnostics.offscreenSpeech || {};
  const settings = diagnostics.settings || {};
  const playback = diagnostics.playback || {};
  const noOffscreenVoice = offscreen && offscreen.matchingVoiceCount === 0;
  const prefix = noOffscreenVoice
    ? "No matching browser or Web Speech voice"
    : "No matching browser voice";

  if (!playback.sharedAudioCandidate) {
    return `${prefix} for ${lang}.`;
  }

  if (!settings.communityAudioEnabled) {
    return `${prefix} for ${lang}; shared audio is disabled.`;
  }

  if (!settings.communityEndpoint) {
    return `${prefix} for ${lang}; shared audio endpoint is missing.`;
  }

  return `${prefix} for ${lang}; shared audio endpoint has no reusable audio yet.`;
}
