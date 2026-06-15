import {
  createLookupKey,
  normalizeSelection
} from "./resolver-core.js";

export const DEFAULT_SYNC_SETTINGS = {
  communitySyncEnabled: false,
  communityEndpoint: ""
};

const MAX_QUEUE_SIZE = 250;
const MAX_ATTEMPTS = 5;

export function normalizeSyncSettings(settings = {}) {
  const endpoint = normalizeEndpoint(settings.communityEndpoint);
  return {
    communitySyncEnabled: Boolean(settings.communitySyncEnabled && endpoint),
    communityEndpoint: endpoint
  };
}

export function endpointOriginPattern(value) {
  const endpoint = normalizeEndpoint(value);
  if (!endpoint) {
    return "";
  }

  const url = new URL(endpoint);
  return `${url.origin}/*`;
}

export function createCommunitySubmission(selection, feedback = {}, result = null) {
  const term = normalizeSelection(selection);
  const kind = normalizeFeedbackKind(feedback.kind);
  const payload = {
    schemaVersion: 1,
    id: createSubmissionId(term, feedback),
    createdAt: new Date().toISOString(),
    term,
    lookupKey: createLookupKey(term),
    kind,
    correction: {},
    result: normalizeResultMetadata(result)
  };

  if (kind === "correction") {
    payload.correction = {
      sourceForm: normalizeSelection(feedback.sourceForm),
      aliases: normalizeAliases(feedback.aliases),
      language: normalizeSelection(feedback.language),
      languageName: normalizeSelection(feedback.languageName),
      origin: normalizeSelection(feedback.origin),
      ipa: normalizeSelection(feedback.ipa),
      simple: normalizeSelection(feedback.simple),
      audioUrl: normalizeLongValue(feedback.audioUrl),
      sourceUrl: normalizeLongValue(feedback.sourceUrl),
      variantNote: normalizeSelection(feedback.variantNote)
    };
    if (!hasCorrectionDetail(payload.correction)) {
      return null;
    }
  }

  return payload;
}

export function enqueueSubmission(queue = [], submission) {
  if (!submission?.lookupKey || !submission?.kind) {
    return normalizeQueue(queue);
  }

  const next = [
    ...normalizeQueue(queue),
    {
      ...submission,
      attempts: Number(submission.attempts || 0),
      lastAttemptAt: submission.lastAttemptAt || "",
      lastError: submission.lastError || ""
    }
  ];

  return next.slice(Math.max(0, next.length - MAX_QUEUE_SIZE));
}

export function enqueueSubmissionWhenEnabled(queue = [], submission, settings = {}) {
  const syncSettings = normalizeSyncSettings(settings);
  if (!syncSettings.communitySyncEnabled) {
    return normalizeQueue(queue);
  }

  return enqueueSubmission(queue, submission);
}

export async function flushSubmissionQueue(queue = [], settings = {}, postSubmission) {
  const syncSettings = normalizeSyncSettings(settings);
  const normalized = normalizeQueue(queue);
  if (!syncSettings.communitySyncEnabled || typeof postSubmission !== "function") {
    return {
      queue: normalized,
      sent: 0,
      failed: 0,
      skipped: normalized.length
    };
  }

  const remaining = [];
  let sent = 0;
  let failed = 0;

  for (const item of normalized) {
    if (item.attempts >= MAX_ATTEMPTS) {
      remaining.push(item);
      continue;
    }

    try {
      await postSubmission(syncSettings.communityEndpoint, item);
      sent += 1;
    } catch (error) {
      failed += 1;
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        lastAttemptAt: new Date().toISOString(),
        lastError: normalizeSelection(error?.message || "Sync failed")
      });
    }
  }

  return {
    queue: remaining,
    sent,
    failed,
    skipped: 0
  };
}

export function syncSummary(queue = []) {
  const normalized = normalizeQueue(queue);
  return {
    queued: normalized.length,
    failed: normalized.filter((item) => item.lastError).length,
    exhausted: normalized.filter((item) => item.attempts >= MAX_ATTEMPTS).length
  };
}

export function normalizeApprovedEntries(payload = {}) {
  const rawEntries = Array.isArray(payload)
    ? payload.map((entry) => ["", entry])
    : Array.isArray(payload.entries)
      ? payload.entries.map((entry) => ["", entry])
      : isPlainObject(payload.entries)
        ? Object.entries(payload.entries)
        : [];

  return Object.fromEntries(rawEntries
    .map(([key, entry]) => normalizeApprovedEntry(entry, key))
    .filter((entry) => entry.lookupKey)
    .map((entry) => [entry.lookupKey, entry]));
}

export function mergeApprovedEntries(existing = {}, incoming = {}) {
  return {
    ...normalizeApprovedEntries({ entries: existing }),
    ...normalizeApprovedEntries({ entries: incoming })
  };
}

export async function pullApprovedEntries(settings = {}, fetchApproved) {
  const syncSettings = normalizeSyncSettings(settings);
  if (!syncSettings.communitySyncEnabled || typeof fetchApproved !== "function") {
    return {
      entries: {},
      received: 0,
      pulledAt: "",
      skipped: true
    };
  }

  const payload = await fetchApproved(syncSettings.communityEndpoint);
  const entries = normalizeApprovedEntries(payload);
  return {
    entries,
    received: Object.keys(entries).length,
    pulledAt: new Date().toISOString(),
    skipped: false
  };
}

function normalizeQueue(queue) {
  return Array.isArray(queue) ? queue.filter((item) => item?.lookupKey && item?.kind) : [];
}

function normalizeResultMetadata(result = null) {
  if (!result || typeof result !== "object") {
    return null;
  }

  return {
    id: normalizeSelection(result.id),
    display: normalizeSelection(result.display),
    sourceForm: normalizeSelection(result.sourceForm),
    aliases: normalizeAliases(result.aliases),
    language: normalizeSelection(result.language),
    languageName: normalizeSelection(result.languageName),
    origin: normalizeSelection(result.origin),
    ipa: normalizeSelection(result.pronunciation?.ipa),
    simple: normalizeSelection(result.pronunciation?.simple),
    audioUrl: firstResultAudioUrl(result),
    sourceUrl: firstResultSourceUrl(result),
    sourceStatus: normalizeSelection(result.sourceStatus),
    confidence: normalizeSelection(result.confidence)
  };
}

function normalizeApprovedEntry(entry = {}, fallbackLookupKey = "") {
  const term = normalizeSelection(entry.term || entry.display || entry.sourceForm);
  const lookupKey = createLookupKey(entry.lookupKey || fallbackLookupKey || term);
  const confirmations = clampNumber(entry.confirmations, 0, 100000);
  const corrections = clampNumber(entry.corrections, 0, 100000);
  const flags = clampNumber(entry.flags, 0, 100000);
  const requests = clampNumber(entry.requests, 0, 100000);
  if (!lookupKey || !hasApprovedEntryContent(entry)) {
    return {};
  }

  return {
    term: term || normalizeSelection(fallbackLookupKey),
    lookupKey,
    confirmations,
    corrections,
    flags,
    requests,
    sourceForm: normalizeSelection(entry.sourceForm),
    aliases: normalizeAliases(entry.aliases),
    language: normalizeSelection(entry.language),
    languageName: normalizeSelection(entry.languageName),
    origin: normalizeSelection(entry.origin),
    ipa: normalizeSelection(entry.ipa),
    simple: normalizeSelection(entry.simple),
    audioUrl: normalizeLongValue(entry.audioUrl),
    sourceUrl: normalizeLongValue(entry.sourceUrl),
    variantNote: normalizeSelection(entry.variantNote),
    trustSignals: normalizeTrustSignals(entry.trustSignals),
    approvedAt: normalizeSelection(entry.approvedAt),
    updatedAt: normalizeSelection(entry.updatedAt || entry.approvedAt)
  };
}

function hasApprovedEntryContent(entry = {}) {
  return Boolean(
    normalizeSelection(entry.lookupKey || entry.term || entry.display || entry.sourceForm) ||
    normalizeAliases(entry.aliases).length ||
    normalizeSelection(entry.language || entry.languageName || entry.origin || entry.ipa || entry.simple || entry.audioUrl || entry.sourceUrl || entry.variantNote) ||
    normalizeTrustSignals(entry.trustSignals).length ||
    clampNumber(entry.confirmations, 0, 100000) ||
    clampNumber(entry.corrections, 0, 100000) ||
    clampNumber(entry.flags, 0, 100000) ||
    clampNumber(entry.requests, 0, 100000)
  );
}

function firstResultAudioUrl(result = {}) {
  const audio = Array.isArray(result.pronunciation?.audio) ? result.pronunciation.audio : [];
  const item = audio.find((candidate) => candidate?.url);
  return normalizeLongValue(item?.url);
}

function firstResultSourceUrl(result = {}) {
  const sources = Array.isArray(result.sources) ? result.sources : [];
  const item = sources.find((candidate) => candidate?.url);
  return normalizeLongValue(item?.url);
}

function normalizeFeedbackKind(kind) {
  return ["confirm", "wrong", "missing", "correction"].includes(kind) ? kind : "missing";
}

function hasCorrectionDetail(correction = {}) {
  return ["sourceForm", "language", "languageName", "origin", "ipa", "simple", "audioUrl", "sourceUrl", "variantNote"]
    .some((field) => Boolean(correction[field])) ||
    Boolean(normalizeAliases(correction.aliases).length);
}

function normalizeAliases(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\n]/);

  return [...new Set(raw.map(normalizeSelection).filter(Boolean))].slice(0, 12);
}

function normalizeTrustSignals(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\n]/);

  return [...new Set(raw.map(normalizeSelection).filter(Boolean))].slice(0, 12);
}

function normalizeEndpoint(value) {
  const raw = normalizeLongValue(value);
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

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clampNumber(value, min, max) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}

function createSubmissionId(term, feedback) {
  const basis = `${createLookupKey(term)}:${normalizeFeedbackKind(feedback.kind)}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  return `sub_${hashString(basis)}`;
}

function hashString(value) {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeLongValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2048);
}
