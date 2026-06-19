import {
  createLookupKey,
  normalizeSelection,
  rankedAudioItems
} from "./resolver-core.js";

export const DEFAULT_SYNC_SETTINGS = {
  communitySyncEnabled: false,
  communityPullEnabled: false,
  communityEndpoint: ""
};

const MAX_QUEUE_SIZE = 250;
const MAX_ATTEMPTS = 5;
const FEEDBACK_KINDS = new Set(["confirm", "wrong", "missing", "correction"]);
const STRUCTURED_FEEDBACK_KINDS = new Set(["missing", "correction"]);

export function normalizeSyncSettings(settings = {}) {
  const endpoint = normalizeEndpoint(settings.communityEndpoint);
  return {
    communitySyncEnabled: Boolean(settings.communitySyncEnabled && endpoint),
    communityPullEnabled: Boolean(settings.communityPullEnabled && endpoint),
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

  if (STRUCTURED_FEEDBACK_KINDS.has(kind)) {
    payload.correction = normalizeCorrection(feedback);
    if (kind === "correction" && !hasCorrectionDetail(payload.correction)) {
      return null;
    }
    if (kind === "missing" && !hasCorrectionDetail(payload.correction)) {
      payload.correction = {};
    }
  }

  return payload;
}

export function enqueueSubmission(queue = [], submission) {
  const normalized = normalizeSubmissionQueue(queue);
  const normalizedSubmission = normalizeQueueItem(submission);
  if (!normalizedSubmission) {
    return normalized;
  }

  const next = [
    ...normalized,
    normalizedSubmission
  ];

  return next.slice(Math.max(0, next.length - MAX_QUEUE_SIZE));
}

export function enqueueSubmissionWhenEnabled(queue = [], submission, settings = {}) {
  const syncSettings = normalizeSyncSettings(settings);
  if (!syncSettings.communitySyncEnabled) {
    return normalizeSubmissionQueue(queue);
  }

  return enqueueSubmission(queue, submission);
}

export async function flushSubmissionQueue(queue = [], settings = {}, postSubmission) {
  const syncSettings = normalizeSyncSettings(settings);
  const normalized = normalizeSubmissionQueue(queue);
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
  const normalized = normalizeSubmissionQueue(queue);
  return {
    queued: normalized.length,
    failed: normalized.filter((item) => item.lastError).length,
    exhausted: normalized.filter((item) => item.attempts >= MAX_ATTEMPTS).length
  };
}

export function normalizeSubmissionQueue(queue = []) {
  return Array.isArray(queue)
    ? queue.map(normalizeQueueItem).filter(Boolean).slice(-MAX_QUEUE_SIZE)
    : [];
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
  if (!syncSettings.communityPullEnabled || typeof fetchApproved !== "function") {
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
    ttsLang: normalizeSelection(result.ttsLang),
    languageName: normalizeSelection(result.languageName),
    origin: normalizeSelection(result.origin),
    root: normalizeSelection(result.root),
    domainHint: normalizeSelection(result.domainHint),
    variants: normalizeVariants(result.variants),
    ipa: normalizeSelection(result.pronunciation?.ipa),
    simple: normalizeSelection(result.pronunciation?.simple),
    audioUrl: firstResultAudioUrl(result),
    sourceUrl: firstResultSourceUrl(result),
    variantNote: normalizeSelection(result.variantNote || result.notes),
    trustSignals: normalizeTrustSignals(result.trustSignals),
    sourceStatus: normalizeSelection(result.sourceStatus),
    confidence: normalizeSelection(result.confidence)
  };
}

function normalizeQueueItem(item = {}) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const term = normalizeSelection(item.term || item.lookupKey);
  const lookupKey = createLookupKey(item.lookupKey || term);
  const kind = normalizeStoredFeedbackKind(item.kind);
  if (!lookupKey || !kind) {
    return null;
  }

  const correction = normalizeCorrection(item.correction);
  const hasStructuredDetail = hasCorrectionDetail(correction);
  if (kind === "correction" && !hasStructuredDetail) {
    return null;
  }

  const shouldKeepCorrection = kind === "correction" || (kind === "missing" && hasStructuredDetail);

  return {
    schemaVersion: 1,
    id: normalizeSelection(item.id) || `sub_${lookupKey}`,
    createdAt: normalizeSelection(item.createdAt),
    term,
    lookupKey,
    kind,
    correction: shouldKeepCorrection ? correction : {},
    result: normalizeResultMetadata(item.result),
    attempts: normalizeAttemptCount(item.attempts),
    lastAttemptAt: normalizeSelection(item.lastAttemptAt),
    lastError: normalizeSelection(item.lastError)
  };
}

function normalizeCorrection(value = {}) {
  return {
    sourceForm: normalizeSelection(value.sourceForm),
    aliases: normalizeAliases(value.aliases),
    language: normalizeSelection(value.language),
    ttsLang: normalizeSelection(value.ttsLang),
    languageName: normalizeSelection(value.languageName),
    origin: normalizeSelection(value.origin),
    root: normalizeSelection(value.root),
    domainHint: normalizeSelection(value.domainHint),
    variants: normalizeVariants(value.variants),
    ipa: normalizeSelection(value.ipa),
    simple: normalizeSelection(value.simple),
    audioUrl: normalizeHttpsUrl(value.audioUrl),
    sourceUrl: normalizeHttpsUrl(value.sourceUrl),
    variantNote: normalizeSelection(value.variantNote)
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
    ttsLang: normalizeSelection(entry.ttsLang),
    languageName: normalizeSelection(entry.languageName),
    origin: normalizeSelection(entry.origin),
    root: normalizeSelection(entry.root),
    domainHint: normalizeSelection(entry.domainHint),
    variants: normalizeVariants(entry.variants),
    ipa: normalizeSelection(entry.ipa),
    simple: normalizeSelection(entry.simple),
    audioUrl: normalizeHttpsUrl(entry.audioUrl),
    provider: normalizeSelection(entry.provider),
    sourceUrl: normalizeHttpsUrl(entry.sourceUrl),
    variantNote: normalizeSelection(entry.variantNote),
    trustSignals: normalizeTrustSignals(entry.trustSignals),
    sourceStatus: normalizeSelection(entry.sourceStatus),
    approvedAt: normalizeSelection(entry.approvedAt),
    updatedAt: normalizeSelection(entry.updatedAt || entry.approvedAt)
  };
}

function hasApprovedEntryContent(entry = {}) {
  return Boolean(
    normalizeSelection(entry.lookupKey || entry.term || entry.display || entry.sourceForm) ||
    normalizeAliases(entry.aliases).length ||
    normalizeVariants(entry.variants).length ||
    normalizeSelection(entry.language || entry.ttsLang || entry.languageName || entry.origin || entry.root || entry.domainHint || entry.ipa || entry.simple || entry.provider || entry.variantNote || entry.sourceStatus) ||
    normalizeHttpsUrl(entry.audioUrl || entry.sourceUrl) ||
    normalizeTrustSignals(entry.trustSignals).length ||
    clampNumber(entry.confirmations, 0, 100000) ||
    clampNumber(entry.corrections, 0, 100000) ||
    clampNumber(entry.flags, 0, 100000) ||
    clampNumber(entry.requests, 0, 100000)
  );
}

function firstResultAudioUrl(result = {}) {
  const audio = Array.isArray(result.pronunciation?.audio) ? result.pronunciation.audio : [];
  for (const item of rankedAudioItems(audio)) {
    const url = normalizeHttpsUrl(item?.url);
    if (url) {
      return url;
    }
  }

  return "";
}

function firstResultSourceUrl(result = {}) {
  const sources = Array.isArray(result.sources) ? result.sources : [];
  const item = sources.find((candidate) => candidate?.url);
  return normalizeHttpsUrl(item?.url);
}

function normalizeFeedbackKind(kind) {
  return FEEDBACK_KINDS.has(kind) ? kind : "missing";
}

function normalizeStoredFeedbackKind(kind) {
  return FEEDBACK_KINDS.has(kind) ? kind : "";
}

function hasCorrectionDetail(correction = {}) {
  return ["sourceForm", "language", "ttsLang", "languageName", "origin", "root", "domainHint", "ipa", "simple", "audioUrl", "sourceUrl", "variantNote"]
    .some((field) => Boolean(correction[field])) ||
    Boolean(normalizeAliases(correction.aliases).length) ||
    Boolean(normalizeVariants(correction.variants).length);
}

function normalizeAliases(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\n]/);

  return [...new Set(raw.map(normalizeSelection).filter(Boolean))].slice(0, 12);
}

function normalizeVariants(value) {
  return normalizeAliases(value);
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

function normalizeHttpsUrl(value) {
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

function normalizeAttemptCount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  return Math.min(MAX_ATTEMPTS, Math.floor(number));
}

function normalizeLongValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2048);
}
