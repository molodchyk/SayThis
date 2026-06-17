import {
  applyCommunitySummary,
  createLookupKey,
  hasCommunityPronunciationData,
  normalizeSelection,
  updateCommunityEntries
} from "../resolver-core.js";
import {
  createCommunitySubmission,
  enqueueSubmissionWhenEnabled,
  flushSubmissionQueue,
  mergeApprovedEntries,
  pullApprovedEntries,
  syncSummary
} from "../community-sync.js";
import {
  normalizeSettings
} from "../shared/settings.js";

const DEFAULT_STORAGE_KEYS = {
  approvedCommunityEntries: "approvedCommunityEntries",
  communityEntries: "communityEntries",
  communityPullState: "communityPullState",
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

function fetcher(dependencies = {}) {
  return dependencies.fetch || globalThis.fetch;
}
