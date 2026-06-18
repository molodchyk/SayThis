import {
  mapResultAudioUrls,
  mergeRemoteResult,
  normalizeSelection,
  resolveTerm
} from "../resolver-core.js";
import {
  isCacheableResult,
  readCachedResult,
  upsertCachedResult
} from "../result-cache.js";
import {
  normalizeCredentials,
  normalizeLanguageHints,
  normalizeSettings,
  onlineCacheScope
} from "../shared/settings.js";
import {
  resolveWithOnlineSources
} from "./online-sources.js";

const DEFAULT_STORAGE_KEYS = {
  approvedCommunityEntries: "approvedCommunityEntries",
  communityEntries: "communityEntries",
  credentials: "credentials",
  lastResult: "lastResult",
  lastSelection: "lastSelection",
  resultCache: "resultCache",
  settings: "settings"
};

export async function resolveSelection(text, options = {}, dependencies = {}) {
  const storageKeys = {
    ...DEFAULT_STORAGE_KEYS,
    ...(dependencies.storageKeys || {})
  };
  const selectedText = normalizeSelection(text);
  const data = await dependencies.loadSeedData();
  const stored = await dependencies.getStorage([
    storageKeys.approvedCommunityEntries,
    storageKeys.communityEntries,
    storageKeys.credentials,
    storageKeys.resultCache,
    storageKeys.settings
  ]);
  const communityEntries = {
    ...(stored[storageKeys.approvedCommunityEntries] || {}),
    ...(stored[storageKeys.communityEntries] || {})
  };
  const settings = normalizeSettings(stored[storageKeys.settings]);
  const credentials = normalizeCredentials(stored[storageKeys.credentials]);
  const hasRequestHints = normalizeLanguageHints(options.languageHints).length > 0;
  const onlineSettings = onlineSettingsForRequest(settings, options);
  const baseLocalResult = resolveTerm(selectedText, {
    entries: data.entries,
    communityEntries
  });
  const providedLocalResult = suppliedLocalResult(options);
  const localResult = providedLocalResult
    ? mergeRemoteResult(baseLocalResult, providedLocalResult)
    : baseLocalResult;

  let result = localResult;
  const shouldUseOnline = options.useOnline ?? (
    hasRequestHints ||
    onlineSettings.onlineByDefault ||
    shouldUseOnlineForPronunciation(selectedText, localResult)
  );
  let resultCache = stored[storageKeys.resultCache];
  if (shouldUseOnline) {
    const cacheOptions = { cacheScope: onlineCacheScope(onlineSettings, credentials) };
    const cached = readCachedResult(resultCache, selectedText, cacheOptions);
    resultCache = cached.cache;

    try {
      const shouldRefreshCache = cached.hit && shouldRefreshCachedResult(cached.result, options);
      const remoteResult = cached.hit && !shouldRefreshCache
        ? cached.result
        : mergeRemoteResult(cached.result, await remoteResolver(dependencies)(selectedText, onlineSettings, credentials, {
          localResult: cached.hit ? mergeRemoteResult(localResult, cached.result) : localResult
        }));
      if ((!cached.hit || shouldRefreshCache) && isCacheableResult(remoteResult)) {
        resultCache = upsertCachedResult(resultCache, selectedText, remoteResult, cacheOptions);
      }
      result = mergeRemoteResult(localResult, remoteResult);
    } catch {
      result = withEvidence(
        cached.hit ? mergeRemoteResult(localResult, cached.result) : localResult,
        "Online lookup unavailable"
      );
    }
  }

  result = mapResultAudioUrls(result, runtimeUrlResolver(dependencies));

  const updates = {
    [storageKeys.lastSelection]: selectedText,
    [storageKeys.lastResult]: result
  };
  if (shouldUseOnline) {
    updates[storageKeys.resultCache] = resultCache;
  }

  await dependencies.setStorage(updates);

  return result;
}

function shouldRefreshCachedResult(result, options = {}) {
  return options.useOnline === true && !hasPlayableAudio(result);
}

function withEvidence(result, item) {
  return {
    ...result,
    evidence: [...new Set([...(result?.evidence || []), item].filter(Boolean))]
  };
}

function hasPlayableAudio(result = {}) {
  return Boolean(result?.pronunciation?.audio?.some((item) => item?.url));
}

function shouldUseOnlineForPronunciation(selectedText, result = {}) {
  return Boolean(
    selectedText &&
    !hasPlayableAudio(result) &&
    (result?.sourceStatus === "best-effort-fallback" ||
      (!normalizeSelection(result?.pronunciation?.simple) &&
        !normalizeSelection(result?.pronunciation?.ipa)))
  );
}

function suppliedLocalResult(options = {}) {
  return options.localResult && typeof options.localResult === "object"
    ? options.localResult
    : null;
}

export function onlineSettingsForRequest(settings, options = {}) {
  const requestHints = normalizeLanguageHints(options.languageHints);
  if (!requestHints.length) {
    return settings;
  }

  return {
    ...settings,
    lookupLanguageHints: normalizeLanguageHints([
      ...settings.lookupLanguageHints,
      ...requestHints
    ])
  };
}

function remoteResolver(dependencies = {}) {
  return dependencies.resolveWithOnlineSources || resolveWithOnlineSources;
}

function runtimeUrlResolver(dependencies = {}) {
  return typeof dependencies.getRuntimeUrl === "function"
    ? dependencies.getRuntimeUrl
    : (url) => url;
}
