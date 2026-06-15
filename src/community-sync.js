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
    result: result ? {
      id: normalizeSelection(result.id),
      display: normalizeSelection(result.display),
      sourceForm: normalizeSelection(result.sourceForm),
      language: normalizeSelection(result.language),
      languageName: normalizeSelection(result.languageName),
      sourceStatus: normalizeSelection(result.sourceStatus),
      confidence: normalizeSelection(result.confidence)
    } : null
  };

  if (kind === "correction") {
    payload.correction = {
      sourceForm: normalizeSelection(feedback.sourceForm),
      language: normalizeSelection(feedback.language),
      languageName: normalizeSelection(feedback.languageName),
      origin: normalizeSelection(feedback.origin),
      ipa: normalizeSelection(feedback.ipa),
      simple: normalizeSelection(feedback.simple),
      audioUrl: normalizeLongValue(feedback.audioUrl),
      variantNote: normalizeSelection(feedback.variantNote)
    };
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
    ? payload
    : Array.isArray(payload.entries)
      ? payload.entries
      : isPlainObject(payload.entries)
        ? Object.values(payload.entries)
        : [];

  return Object.fromEntries(rawEntries
    .map(normalizeApprovedEntry)
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

function normalizeApprovedEntry(entry = {}) {
  const term = normalizeSelection(entry.term || entry.display || entry.sourceForm);
  const lookupKey = createLookupKey(entry.lookupKey || term);
  const confirmations = clampNumber(entry.confirmations, 0, 100000);
  const corrections = clampNumber(entry.corrections, 0, 100000);
  const flags = clampNumber(entry.flags, 0, 100000);
  const requests = clampNumber(entry.requests, 0, 100000);

  return {
    term,
    lookupKey,
    confirmations,
    corrections,
    flags,
    requests,
    sourceForm: normalizeSelection(entry.sourceForm),
    language: normalizeSelection(entry.language),
    languageName: normalizeSelection(entry.languageName),
    origin: normalizeSelection(entry.origin),
    ipa: normalizeSelection(entry.ipa),
    simple: normalizeSelection(entry.simple),
    audioUrl: normalizeLongValue(entry.audioUrl),
    variantNote: normalizeSelection(entry.variantNote),
    approvedAt: normalizeSelection(entry.approvedAt),
    updatedAt: normalizeSelection(entry.updatedAt || entry.approvedAt)
  };
}

function normalizeFeedbackKind(kind) {
  return ["confirm", "wrong", "missing", "correction"].includes(kind) ? kind : "missing";
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
