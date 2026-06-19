import {
  createLookupKey,
  normalizeSelection
} from "../resolver-core.js";

const DEFAULT_PREPARED_SHARED_AUDIO_TTL_MS = 8000;
const DEFAULT_MAX_PREPARED_SHARED_AUDIO_RECORDS = 8;
const preparedSharedAudioRequests = new Map();

export async function requestDirectSharedAudio(selectedText, options = {}, dependencies = {}) {
  if (typeof dependencies.requestSharedAudio !== "function") {
    return null;
  }

  try {
    return await dependencies.requestSharedAudio(selectedText, null, compactOptions({
      rate: options.rate,
      trace: options.trace,
      directLookup: true,
      skipRefresh: true
    }));
  } catch {
    return null;
  }
}

export function prepareSharedAudio(selectedText, options = {}, dependencies = {}) {
  if (typeof dependencies.requestSharedAudio !== "function") {
    return;
  }

  const keys = preparedSharedAudioKeys(selectedText, options.trace);
  if (!keys.length || preparedRecordForKeys(keys)) {
    return;
  }

  const ttlMs = normalizePreparedTtlMs(dependencies.preparedSharedAudioTtlMs);
  const record = {
    keys,
    expiresAt: Date.now() + ttlMs,
    promise: requestDirectSharedAudio(selectedText, options, dependencies)
  };
  keys.forEach((key) => preparedSharedAudioRequests.set(key, record));
  prunePreparedSharedAudioRecords(dependencies.preparedSharedAudioMaxRecords);

  const timeoutId = setTimeout(() => {
    if (keys.some((key) => preparedSharedAudioRequests.get(key) === record)) {
      deletePreparedRecord(record);
    }
  }, ttlMs);
  timeoutId?.unref?.();
}

export function takePreparedSharedAudio(selectedText, options = {}) {
  const record = preparedRecordForKeys(preparedSharedAudioKeys(selectedText, options.trace));
  if (!record) {
    return null;
  }

  deletePreparedRecord(record);
  return Date.now() <= record.expiresAt ? record.promise : null;
}

export function clearPreparedSharedAudioForTests() {
  preparedSharedAudioRequests.clear();
}

function preparedRecordForKeys(keys = []) {
  const record = keys.map((key) => preparedSharedAudioRequests.get(key)).find(Boolean);
  if (!record) {
    return null;
  }

  if (Date.now() > record.expiresAt) {
    deletePreparedRecord(record);
    return null;
  }

  return record;
}

function deletePreparedRecord(record) {
  record.keys.forEach((key) => {
    if (preparedSharedAudioRequests.get(key) === record) {
      preparedSharedAudioRequests.delete(key);
    }
  });
}

function preparedSharedAudioKeys(selectedText, trace = null) {
  const lookupKey = createLookupKey(selectedText);
  if (!lookupKey) {
    return [];
  }

  const traceId = normalizeSelection(trace?.id);
  return [
    ...(traceId ? [`trace:${traceId}:${lookupKey}`] : []),
    `selection:${lookupKey}`
  ];
}

function prunePreparedSharedAudioRecords(maxRecordsValue) {
  const maxRecords = normalizeMaxRecords(maxRecordsValue);
  const records = [...new Set(preparedSharedAudioRequests.values())]
    .sort((left, right) => left.expiresAt - right.expiresAt);
  while (records.length > maxRecords) {
    deletePreparedRecord(records.shift());
  }
}

function normalizePreparedTtlMs(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, number)
    : DEFAULT_PREPARED_SHARED_AUDIO_TTL_MS;
}

function normalizeMaxRecords(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(1, Math.floor(number))
    : DEFAULT_MAX_PREPARED_SHARED_AUDIO_RECORDS;
}

function compactOptions(options = {}) {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined)
  );
}
