import {
  createLookupKey,
  applyCommunitySummary,
  getBestAudio,
  hasCommunityPronunciationData,
  hasPreferredAudio,
  hasTopTierAudio,
  normalizeSelection,
  updateCommunityEntries
} from "../resolver-core.js";
import {
  createCommunitySubmission,
  enqueueSubmissionWhenEnabled,
  flushSubmissionQueue,
  mergeApprovedEntries,
  normalizeApprovedEntries,
  pullApprovedEntries,
  syncSummary
} from "../community-sync.js";
import {
  normalizeCredentials,
  normalizeSettings
} from "../shared/settings.js";
import {
  hasUsefulSharedAudioTarget
} from "../result/shared-audio.js";
import {
  languageCodeFromLanguage
} from "../resolver/language.js";
import {
  resultWithSharedAudioEntry
} from "./community/shared-audio-result.js";

const DEFAULT_STORAGE_KEYS = {
  approvedCommunityEntries: "approvedCommunityEntries",
  communityEntries: "communityEntries",
  communityPullState: "communityPullState",
  credentials: "credentials",
  lastResult: "lastResult",
  lastSelection: "lastSelection",
  syncQueue: "syncQueue",
  syncSummary: "syncSummary",
  settings: "settings"
};

export async function saveFeedback(text, feedback, dependencies = {}) {
  const storageKeys = storageKeysFor(dependencies);
  const selectedText = normalizeSelection(text);
  const stored = await dependencies.getStorage([
    storageKeys.communityEntries,
    storageKeys.settings,
    storageKeys.syncQueue,
    storageKeys.lastResult
  ]);
  const settings = normalizeSettings(stored[storageKeys.settings]);
  const communityEntries = updateCommunityEntries(
    stored[storageKeys.communityEntries],
    selectedText,
    feedback
  );
  const submission = createCommunitySubmission(selectedText, feedback, stored[storageKeys.lastResult]);
  const syncQueue = enqueueSubmissionWhenEnabled(stored[storageKeys.syncQueue], submission, settings);

  await dependencies.setStorage({
    [storageKeys.communityEntries]: communityEntries,
    [storageKeys.syncQueue]: syncQueue,
    [storageKeys.syncSummary]: syncSummary(syncQueue)
  });

  if (settings.communitySyncEnabled) {
    communitySyncRunner(dependencies)().catch(() => {});
  }

  const feedbackResult = await resultAfterFeedback(
    selectedText,
    stored[storageKeys.lastResult],
    communityEntries,
    dependencies
  );
  await dependencies.setStorage({
    [storageKeys.lastSelection]: selectedText,
    [storageKeys.lastResult]: feedbackResult
  });
  return feedbackResult;
}

export async function resultAfterFeedback(selectedText, lastResult, communityEntries, dependencies = {}) {
  const lookupKey = createLookupKey(selectedText);
  const communityEntry = communityEntries?.[lookupKey];
  if (hasCommunityPronunciationData(communityEntry)) {
    return dependencies.resolveSelection(selectedText, { useOnline: false });
  }

  if (resultMatchesSelection(lastResult, lookupKey)) {
    return applyCommunitySummary(lastResult, communityEntry);
  }

  return dependencies.resolveSelection(selectedText, { useOnline: false });
}

export function resultMatchesSelection(result, lookupKey) {
  if (!result || !lookupKey) {
    return false;
  }

  return [
    result.query,
    result.display
  ].some((value) => createLookupKey(value) === lookupKey);
}

export async function flushCommunitySync(dependencies = {}) {
  const storageKeys = storageKeysFor(dependencies);
  const stored = await dependencies.getStorage([storageKeys.settings, storageKeys.syncQueue]);
  const settings = normalizeSettings(stored[storageKeys.settings]);
  const result = await flushSubmissionQueue(
    stored[storageKeys.syncQueue],
    settings,
    communityPoster(dependencies)
  );
  const summary = syncSummary(result.queue);

  await dependencies.setStorage({
    [storageKeys.syncQueue]: result.queue,
    [storageKeys.syncSummary]: summary
  });

  return {
    ...summary,
    sent: result.sent,
    failedThisRun: result.failed
  };
}

export async function pullApprovedCommunityEntries(dependencies = {}) {
  const storageKeys = storageKeysFor(dependencies);
  const stored = await dependencies.getStorage([
    storageKeys.approvedCommunityEntries,
    storageKeys.settings
  ]);
  const settings = normalizeSettings(stored[storageKeys.settings]);
  const result = await pullApprovedEntries(settings, approvedEntryFetcher(dependencies));
  const approvedCommunityEntries = mergeApprovedEntries(
    stored[storageKeys.approvedCommunityEntries],
    result.entries
  );
  const summary = {
    received: result.received,
    total: Object.keys(approvedCommunityEntries).length,
    pulledAt: result.pulledAt,
    skipped: result.skipped
  };

  await dependencies.setStorage({
    [storageKeys.approvedCommunityEntries]: approvedCommunityEntries,
    [storageKeys.communityPullState]: summary
  });

  return summary;
}

export async function requestSharedAudioForResult(text, result = null, options = {}, dependencies = {}) {
  const storageKeys = storageKeysFor(dependencies);
  const selectedText = normalizeSelection(text);
  const baseResult = result && typeof result === "object" ? result : null;
  if (!selectedText) {
    throw new Error("No text selected.");
  }

  if (hasTopTierAudio(baseResult)) {
    return baseResult;
  }

  const stored = await dependencies.getStorage([
    storageKeys.approvedCommunityEntries,
    storageKeys.credentials,
    storageKeys.settings
  ]);

  const body = sharedAudioRequestBody(selectedText, baseResult, options);
  if (!body) {
    throw new Error("Shared audio needs a useful resolved source form and language.");
  }

  const localEntry = approvedAudioEntryForRequest(stored[storageKeys.approvedCommunityEntries], body);
  if (localEntry) {
    const aliasEntry = approvedAudioAliasForRequest(localEntry, body);
    if (aliasEntry) {
      await dependencies.setStorage({
        [storageKeys.approvedCommunityEntries]: mergeApprovedEntries(
          stored[storageKeys.approvedCommunityEntries],
          { [aliasEntry.lookupKey]: aliasEntry }
        )
      });
    }

    return refreshSharedAudioResultWithEntry(
      selectedText,
      baseResult,
      aliasEntry || localEntry,
      dependencies,
      storageKeys
    );
  }

  const settings = normalizeSettings(stored[storageKeys.settings]);
  const credentials = normalizeCredentials(stored[storageKeys.credentials]);
  const hasPreferred = hasPreferredAudio(baseResult);
  if (!settings.communityEndpoint || !settings.communityAudioEnabled) {
    if (hasPreferred) {
      return baseResult;
    }
    throw new Error("Shared audio endpoint is not enabled.");
  }

  let payload;
  try {
    payload = await requestSharedAudioEntry(settings.communityEndpoint, body, {
      ...dependencies,
      sharedAudioGenerationToken: hasPreferred ? "" : credentials.sharedAudioGenerationToken
    });
  } catch (error) {
    if (hasPreferred) {
      return baseResult;
    }
    throw error;
  }
  const incoming = approvedEntriesForSharedAudioRequest(payload.entry, body);
  const approvedCommunityEntries = mergeApprovedEntries(
    stored[storageKeys.approvedCommunityEntries],
    incoming
  );

  await dependencies.setStorage({
    [storageKeys.approvedCommunityEntries]: approvedCommunityEntries
  });

  const attachedEntry = approvedAudioEntryForRequest(incoming, body) || payload.entry;
  return refreshSharedAudioResultWithEntry(
    selectedText,
    baseResult,
    attachedEntry,
    dependencies,
    storageKeys
  );
}

export async function postCommunitySubmission(endpoint, submission, dependencies = {}) {
  const response = await fetcher(dependencies)(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(submission)
  });

  if (!response.ok) {
    throw new Error(`Community sync failed with ${response.status}`);
  }
}

export async function requestSharedAudioEntry(endpoint, body, dependencies = {}) {
  const url = new URL(endpoint);
  url.searchParams.set("action", "audio");
  const token = normalizeCredentials({
    sharedAudioGenerationToken: dependencies.sharedAudioGenerationToken
  }).sharedAudioGenerationToken;
  const response = await fetcher(dependencies)(url.toString(), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Shared audio failed with ${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.entry?.audioUrl) {
    throw new Error("Shared audio response did not include audio.");
  }

  return payload;
}

export async function fetchApprovedCommunityEntries(endpoint, dependencies = {}) {
  const url = new URL(endpoint);
  url.searchParams.set("action", "approved");
  const response = await fetcher(dependencies)(url.toString(), {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Community refresh failed with ${response.status}`);
  }

  return response.json();
}

function storageKeysFor(dependencies = {}) {
  return {
    ...DEFAULT_STORAGE_KEYS,
    ...(dependencies.storageKeys || {})
  };
}

function communitySyncRunner(dependencies = {}) {
  return dependencies.flushCommunitySync || (() => flushCommunitySync(dependencies));
}

function communityPoster(dependencies = {}) {
  return dependencies.postCommunitySubmission ||
    ((endpoint, submission) => postCommunitySubmission(endpoint, submission, dependencies));
}

function approvedEntryFetcher(dependencies = {}) {
  return dependencies.fetchApprovedCommunityEntries ||
    ((endpoint) => fetchApprovedCommunityEntries(endpoint, dependencies));
}

function sharedAudioRequestBody(selectedText, result = {}, options = {}) {
  const sourceForm = normalizeSelection(result?.sourceForm || result?.display || selectedText);
  const language = normalizeSelection(result?.language);
  const ttsLang = normalizeSelection(result?.ttsLang || language);
  const sourceStatus = normalizeSelection(result?.sourceStatus);
  if (
    !sourceForm ||
    !ttsLang ||
    ["", "unknown", "best-effort-fallback"].includes(sourceStatus) ||
    !hasUsefulSharedAudioTarget(selectedText, sourceForm, language, ttsLang)
  ) {
    return null;
  }

  const aliases = normalizeList(result?.aliases).slice(0, 12);
  const variants = normalizeList(result?.variants).slice(0, 12);
  const ipa = normalizeSelection(result?.pronunciation?.ipa || result?.ipa);
  const simple = normalizeSelection(result?.pronunciation?.simple || result?.simple);
  return {
    term: normalizeSelection(result?.display || result?.query || selectedText),
    lookupKey: createLookupKey(result?.lookupKey || selectedText),
    sourceForm,
    language,
    ttsLang,
    ...optionalTextField("languageName", result?.languageName),
    ...optionalTextField("origin", result?.origin),
    ...optionalTextField("root", result?.root),
    ...optionalTextField("domainHint", result?.domainHint),
    ...(aliases.length ? { aliases } : {}),
    ...(variants.length ? { variants } : {}),
    ...(ipa ? { ipa } : {}),
    ...(simple ? { simple } : {}),
    sourceUrl: firstSourceUrl(result),
    ...optionalTextField("variantNote", result?.variantNote || result?.notes),
    ...optionalListField("trustSignals", result?.trustSignals),
    rate: Number.isFinite(Number(options.rate)) ? Number(options.rate) : undefined
  };
}

function approvedAudioEntryForRequest(approvedEntries = {}, request = {}) {
  const lookupKey = createLookupKey(request.lookupKey || request.term || request.sourceForm);
  const entries = normalizeApprovedEntries({ entries: approvedEntries });
  const requestedLang = baseLanguage(request.ttsLang || request.language);
  const directEntry = lookupKey ? compatibleApprovedAudioEntry(entries?.[lookupKey], requestedLang) : null;
  if (directEntry) {
    return directEntry;
  }

  const requestKeys = sharedAudioRequestKeys(request);
  if (!requestKeys.length) {
    return null;
  }

  return Object.values(entries).find((entry) =>
    sharedAudioEntryMatchesRequest(entry, requestKeys, requestedLang)) || null;
}

function compatibleApprovedAudioEntry(entry, requestedLang) {
  if (!entry?.audioUrl) {
    return null;
  }

  const entryLang = baseLanguage(entry.ttsLang || entry.language);
  if (requestedLang && entryLang && requestedLang !== entryLang) {
    return null;
  }

  return entry;
}

function sharedAudioEntryMatchesRequest(entry, requestKeys, requestedLang) {
  const entryLang = baseLanguage(entry?.ttsLang || entry?.language);
  if (!requestedLang || !entryLang || requestedLang !== entryLang || !compatibleApprovedAudioEntry(entry, requestedLang)) {
    return false;
  }

  const entryKeys = new Set(sharedAudioEntryKeys(entry));
  return requestKeys.some((key) => entryKeys.has(key));
}

function approvedEntriesForSharedAudioRequest(entry, request = {}) {
  const normalized = normalizeApprovedEntries({ entries: [entry] });
  const baseEntry = Object.values(normalized)[0];
  if (!baseEntry) {
    return {};
  }

  const aliasEntry = approvedAudioAliasForRequest(baseEntry, request);
  return normalizeApprovedEntries({
    entries: aliasEntry ? [baseEntry, aliasEntry] : [baseEntry]
  });
}

function approvedAudioAliasForRequest(entry = {}, request = {}) {
  const requestLookupKey = createLookupKey(request.lookupKey || request.term || request.sourceForm);
  const entryLookupKey = createLookupKey(entry.lookupKey || entry.term || entry.sourceForm);
  if (!requestLookupKey || !entryLookupKey || requestLookupKey === entryLookupKey) {
    return null;
  }

  return {
    ...entry,
    term: normalizeSelection(request.term || entry.term),
    lookupKey: requestLookupKey,
    sourceForm: normalizeSelection(entry.sourceForm || request.sourceForm),
    language: normalizeSelection(entry.language || request.language),
    ttsLang: normalizeSelection(entry.ttsLang || request.ttsLang)
  };
}

function sharedAudioRequestKeys(request = {}) {
  return uniqueLookupKeys([
    request.lookupKey,
    request.term,
    request.display,
    request.sourceForm,
    ...normalizeList(request.aliases),
    ...normalizeList(request.variants)
  ]);
}

function sharedAudioEntryKeys(entry = {}) {
  return uniqueLookupKeys([
    entry.lookupKey,
    entry.term,
    entry.display,
    entry.sourceForm,
    ...normalizeList(entry.aliases),
    ...normalizeList(entry.variants)
  ]);
}

function uniqueLookupKeys(values = []) {
  return [...new Set(values.map(createLookupKey).filter(Boolean))];
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeSelection).filter(Boolean);
  }

  return String(value || "")
    .split(/[;,\n]/)
    .map(normalizeSelection)
    .filter(Boolean);
}

function optionalTextField(key, value) {
  const normalized = normalizeSelection(value);
  return normalized ? { [key]: normalized } : {};
}

function optionalListField(key, value) {
  const normalized = normalizeList(value).slice(0, 12);
  return normalized.length ? { [key]: normalized } : {};
}

async function refreshSharedAudioResult(selectedText, baseResult, dependencies = {}, storageKeys = DEFAULT_STORAGE_KEYS) {
  const resolved = typeof dependencies.resolveSelection === "function"
    ? await dependencies.resolveSelection(selectedText, {
      useOnline: false,
      localResult: baseResult
    })
    : baseResult;

  if (resolved) {
    await dependencies.setStorage({
      [storageKeys.lastSelection]: selectedText,
      [storageKeys.lastResult]: resolved
    });
  }

  return resolved || baseResult;
}

async function refreshSharedAudioResultWithEntry(
  selectedText,
  baseResult,
  entry,
  dependencies = {},
  storageKeys = DEFAULT_STORAGE_KEYS
) {
  let refreshed = baseResult;
  try {
    refreshed = await refreshSharedAudioResult(selectedText, baseResult, dependencies, storageKeys);
  } catch {
    refreshed = baseResult;
  }

  if (hasTopTierAudio(refreshed) || (getBestAudio(refreshed) && isGeneratedSharedAudioEntry(entry))) {
    return refreshed;
  }

  const attached = resultWithSharedAudioEntry(refreshed || baseResult, entry);
  if (attached && attached !== refreshed) {
    await dependencies.setStorage?.({
      [storageKeys.lastSelection]: selectedText,
      [storageKeys.lastResult]: attached
    });
  }

  return attached || refreshed || baseResult;
}

function isGeneratedSharedAudioEntry(entry = {}) {
  return normalizeSelection(entry.sourceStatus) === "generated-audio" ||
    normalizeList(entry.trustSignals).includes("generated-audio");
}

function firstSourceUrl(result = {}) {
  const direct = normalizeSelection(result.sourceUrl);
  if (direct) {
    return direct;
  }

  const source = Array.isArray(result.sources)
    ? result.sources.find((item) => item?.url)
    : null;
  return normalizeSelection(source?.url);
}

function baseLanguage(value) {
  return (languageCodeFromLanguage(value) || normalizeSelection(value)).toLowerCase().split(/[-_]/)[0];
}

function fetcher(dependencies = {}) {
  return dependencies.fetch || globalThis.fetch;
}
