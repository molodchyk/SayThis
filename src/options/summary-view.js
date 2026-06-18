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
