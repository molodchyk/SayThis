import {
  createLookupKey,
  normalizeSelection
} from "../src/resolver-core.js";

export const STORE_SCHEMA_VERSION = 1;

export function createEmptyStore(now = new Date().toISOString()) {
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    pending: [],
    approved: {},
    rejected: []
  };
}

export function normalizeStore(value, now = new Date().toISOString()) {
  if (!value || typeof value !== "object") {
    return createEmptyStore(now);
  }

  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    createdAt: normalizeSelection(value.createdAt) || now,
    updatedAt: normalizeSelection(value.updatedAt) || now,
    pending: Array.isArray(value.pending) ? value.pending.map(normalizeSubmission).filter(Boolean) : [],
    approved: normalizeApprovedMap(value.approved),
    rejected: Array.isArray(value.rejected) ? value.rejected.map(normalizeRejection).filter(Boolean) : []
  };
}

export function acceptSubmission(store, submission, now = new Date().toISOString(), options = {}) {
  const normalizedStore = normalizeStore(store, now);
  const normalizedSubmission = normalizeSubmission(submission, now);
  if (!normalizedSubmission) {
    return {
      store: normalizedStore,
      accepted: false,
      reason: "invalid-submission"
    };
  }

  if (normalizedStore.pending.some((item) => item.id === normalizedSubmission.id)) {
    return {
      store: normalizedStore,
      accepted: true,
      duplicate: true,
      submission: normalizedSubmission
    };
  }

  const maxPendingSubmissions = normalizeOptionalPositiveInteger(options.maxPendingSubmissions);
  if (maxPendingSubmissions && normalizedStore.pending.length >= maxPendingSubmissions) {
    return {
      store: normalizedStore,
      accepted: false,
      reason: "pending-limit-reached",
      submission: normalizedSubmission
    };
  }

  return {
    store: {
      ...normalizedStore,
      updatedAt: now,
      pending: [...normalizedStore.pending, normalizedSubmission]
    },
    accepted: true,
    duplicate: false,
    submission: normalizedSubmission
  };
}

export function approveSubmission(store, submissionId, review = {}, now = new Date().toISOString()) {
  const normalizedStore = normalizeStore(store, now);
  const id = normalizeSelection(submissionId);
  const submission = normalizedStore.pending.find((item) => item.id === id);
  if (!submission) {
    return {
      store: normalizedStore,
      approved: false,
      reason: "not-found"
    };
  }

  const entry = approvedEntryFromSubmission(submission, review.entry || {}, now);
  if (!entry.lookupKey) {
    return {
      store: normalizedStore,
      approved: false,
      reason: "invalid-entry"
    };
  }

  return {
    store: {
      ...normalizedStore,
      updatedAt: now,
      pending: normalizedStore.pending.filter((item) => item.id !== id),
      approved: {
        ...normalizedStore.approved,
        [entry.lookupKey]: entry
      }
    },
    approved: true,
    entry
  };
}

export function rejectSubmission(store, submissionId, reason = "", now = new Date().toISOString()) {
  const normalizedStore = normalizeStore(store, now);
  const id = normalizeSelection(submissionId);
  const submission = normalizedStore.pending.find((item) => item.id === id);
  if (!submission) {
    return {
      store: normalizedStore,
      rejected: false,
      reason: "not-found"
    };
  }

  const rejection = normalizeRejection({
    id,
    term: submission.term,
    lookupKey: submission.lookupKey,
    reason,
    rejectedAt: now
  });

  return {
    store: {
      ...normalizedStore,
      updatedAt: now,
      pending: normalizedStore.pending.filter((item) => item.id !== id),
      rejected: [...normalizedStore.rejected, rejection]
    },
    rejected: true,
    rejection
  };
}

export function approvedEntriesPayload(store) {
  const normalizedStore = normalizeStore(store);
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    entries: Object.values(normalizedStore.approved)
  };
}

export function pendingPayload(store) {
  const normalizedStore = normalizeStore(store);
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    pending: normalizedStore.pending
  };
}

function approvedEntryFromSubmission(submission, override = {}, now) {
  const correction = submission.correction || {};
  const result = submission.result || {};
  const term = normalizeSelection(override.term || submission.term || result.display);
  const sourceForm = normalizeSelection(override.sourceForm || correction.sourceForm || result.sourceForm || term);
  const lookupKey = createLookupKey(override.lookupKey || submission.lookupKey || term);

  return normalizeApprovedEntry({
    term,
    lookupKey,
    confirmations: Number(override.confirmations ?? (submission.kind === "confirm" ? 1 : 0)),
    corrections: Number(override.corrections ?? (submission.kind === "correction" ? 1 : 0)),
    flags: 0,
    requests: Number(override.requests ?? (submission.kind === "missing" ? 1 : 0)),
    sourceForm,
    language: override.language || correction.language || result.language,
    languageName: override.languageName || correction.languageName || result.languageName,
    origin: override.origin || correction.origin,
    ipa: override.ipa || correction.ipa,
    simple: override.simple || correction.simple,
    audioUrl: override.audioUrl || correction.audioUrl,
    variantNote: override.variantNote || correction.variantNote,
    approvedAt: now,
    updatedAt: now
  });
}

function normalizeSubmission(value, now = new Date().toISOString()) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const term = normalizeSelection(value.term);
  const lookupKey = createLookupKey(value.lookupKey || term);
  const kind = normalizeKind(value.kind);
  if (!term || !lookupKey || !kind) {
    return null;
  }
  const correction = normalizeCorrection(value.correction);
  if (kind === "correction" && !hasCorrectionDetail(correction)) {
    return null;
  }

  return {
    schemaVersion: 1,
    id: normalizeSelection(value.id) || `sub_${lookupKey}_${Date.now()}`,
    createdAt: normalizeSelection(value.createdAt) || now,
    receivedAt: normalizeSelection(value.receivedAt) || now,
    term,
    lookupKey,
    kind,
    correction,
    result: normalizeResultMetadata(value.result)
  };
}

function normalizeCorrection(value = {}) {
  return {
    sourceForm: normalizeSelection(value.sourceForm),
    language: normalizeSelection(value.language),
    languageName: normalizeSelection(value.languageName),
    origin: normalizeSelection(value.origin),
    ipa: normalizeSelection(value.ipa),
    simple: normalizeSelection(value.simple),
    audioUrl: normalizeLongValue(value.audioUrl),
    variantNote: normalizeSelection(value.variantNote)
  };
}

function normalizeResultMetadata(value = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    id: normalizeSelection(value.id),
    display: normalizeSelection(value.display),
    sourceForm: normalizeSelection(value.sourceForm),
    language: normalizeSelection(value.language),
    languageName: normalizeSelection(value.languageName),
    sourceStatus: normalizeSelection(value.sourceStatus),
    confidence: normalizeSelection(value.confidence)
  };
}

function normalizeApprovedMap(value = {}) {
  if (!value || typeof value !== "object") {
    return {};
  }

  const entries = Array.isArray(value) ? value : Object.values(value);
  return Object.fromEntries(entries
    .map(normalizeApprovedEntry)
    .filter((entry) => entry.lookupKey)
    .map((entry) => [entry.lookupKey, entry]));
}

function normalizeApprovedEntry(value = {}) {
  const term = normalizeSelection(value.term || value.display || value.sourceForm);
  const lookupKey = createLookupKey(value.lookupKey || term);
  return {
    term,
    lookupKey,
    confirmations: clampNumber(value.confirmations, 0, 100000),
    corrections: clampNumber(value.corrections, 0, 100000),
    flags: clampNumber(value.flags, 0, 100000),
    requests: clampNumber(value.requests, 0, 100000),
    sourceForm: normalizeSelection(value.sourceForm),
    language: normalizeSelection(value.language),
    languageName: normalizeSelection(value.languageName),
    origin: normalizeSelection(value.origin),
    ipa: normalizeSelection(value.ipa),
    simple: normalizeSelection(value.simple),
    audioUrl: normalizeLongValue(value.audioUrl),
    variantNote: normalizeSelection(value.variantNote),
    approvedAt: normalizeSelection(value.approvedAt),
    updatedAt: normalizeSelection(value.updatedAt || value.approvedAt)
  };
}

function normalizeRejection(value = {}) {
  const id = normalizeSelection(value.id);
  if (!id) {
    return null;
  }

  return {
    id,
    term: normalizeSelection(value.term),
    lookupKey: createLookupKey(value.lookupKey || value.term),
    reason: normalizeSelection(value.reason),
    rejectedAt: normalizeSelection(value.rejectedAt)
  };
}

function normalizeKind(kind) {
  return ["confirm", "wrong", "missing", "correction"].includes(kind) ? kind : "";
}

function hasCorrectionDetail(correction = {}) {
  return ["sourceForm", "language", "languageName", "origin", "ipa", "simple", "audioUrl", "variantNote"]
    .some((field) => Boolean(correction[field]));
}

function clampNumber(value, min, max) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}

function normalizeOptionalPositiveInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) {
    return 0;
  }

  return Math.floor(number);
}

function normalizeLongValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2048);
}
