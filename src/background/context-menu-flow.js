import {
  createLookupKey,
  getBestAudio
} from "../resolver-core.js";
import {
  resolvePlayableResult
} from "./pronunciation-playback-flow.js";
import {
  requestPreparedOrDirectSharedAudio
} from "./prepared-shared-audio-flow.js";

const DEFAULT_DIRECT_SHARED_AUDIO_WAIT_MS = 450;
const DEFAULT_STORED_RESULT_GRACE_MS = 10;

export async function handleContextMenuClick(info = {}, tab = {}, dependencies = {}) {
  const action = dependencies.resolveOptionsForMenuId?.(info.menuItemId);
  if (!action?.ok) {
    return { handled: false, reason: "unknown-menu" };
  }

  const selectedText = dependencies.normalizeSelection?.(info.selectionText) || "";
  if (!selectedText) {
    return { handled: false, reason: "empty-selection" };
  }

  try {
    const trace = createTrace(action.source || "context-menu");
    dependencies.recordDebugEvent?.("ui:context-menu-click", {
      text: selectedText,
      trace
    });
    startPreparingPlayback(dependencies, trace);

    setStorageBestEffort(dependencies, {
      lastSelection: selectedText,
      lastSource: action.source
    });

    const options = {
      ...(action.options || {}),
      trace
    };
    if (options.useOnline === true) {
      return await handleOnlineLookupAndPronounce(selectedText, tab?.id, options, dependencies, trace);
    }

    const candidate = await firstContextMenuAudioCandidate(selectedText, options, dependencies, trace);
    if (candidate?.result) {
      const storedResult = candidate.result;
      setStorageBestEffort(dependencies, {
        [dependencies.lastResultKey || "lastResult"]: storedResult
      });
      await dependencies.playResolvedResult?.(storedResult, tab?.id, trace);
      return { handled: true, result: storedResult, reusedStored: true };
    }

    const result = await dependencies.resolveSelection(selectedText, options);
    const playableResult = await resolvePlayableResult(
      selectedText,
      result,
      immediatePlaybackOptions(options),
      dependencies
    );
    setStorageBestEffort(dependencies, {
      [dependencies.lastResultKey || "lastResult"]: playableResult
    });
    await dependencies.playResolvedResult?.(playableResult, tab?.id, trace);

    return { handled: true, result: playableResult };
  } catch (error) {
    return {
      handled: false,
      reason: "resolve-failed",
      error
    };
  }
}

async function handleOnlineLookupAndPronounce(selectedText, tabId, options = {}, dependencies = {}, trace = null) {
  const immediateCandidate = await firstContextMenuAudioCandidate(selectedText, options, dependencies, trace);
  const localResult = immediateCandidate?.localResult || immediateCandidate?.result || null;
  const immediateResult = immediateCandidate?.result || null;

  const playedImmediate = Boolean(getBestAudio(immediateResult)?.url);

  if (playedImmediate) {
    setStorageBestEffort(dependencies, {
      [dependencies.lastResultKey || "lastResult"]: immediateResult
    });
    await dependencies.playResolvedResult?.(immediateResult, tabId, trace);
  }

  try {
    const refreshStartedAt = Date.now();
    dependencies.recordDebugEvent?.("online-refresh:start", {
      text: selectedText,
      immediateAudio: playedImmediate,
      trace
    });
    const onlineResult = await dependencies.resolveSelection(selectedText, {
      ...options,
      useOnline: true,
      localResult
    });
    const playableResult = await resolvePlayableResult(selectedText, onlineResult, {
      ...options,
      useOnline: true,
      trace
    }, dependencies);
    setStorageBestEffort(dependencies, {
      [dependencies.lastResultKey || "lastResult"]: playableResult
    });
    dependencies.recordDebugEvent?.("online-refresh:result", {
      elapsedMs: Date.now() - refreshStartedAt,
      immediateAudio: playedImmediate,
      trace
    });

    if (playedImmediate) {
      await dependencies.showResultOnTab?.(tabId, playableResult);
    } else {
      await dependencies.playResolvedResult?.(playableResult, tabId, trace);
    }

    return { handled: true, result: playableResult };
  } catch (error) {
    dependencies.recordDebugEvent?.("online-refresh:error", {
      immediateAudio: playedImmediate,
      error: error?.message || String(error || "Unknown error"),
      trace
    });
    if (playedImmediate) {
      return { handled: true, result: immediateResult, onlineError: error };
    }

    throw error;
  }
}

async function firstContextMenuAudioCandidate(selectedText, options = {}, dependencies = {}, trace = null) {
  const storedCandidatePromise = storedAudioCandidate(selectedText, dependencies, trace);
  const storedGracePromise = waitForStoredResultGrace(
    storedCandidatePromise,
    dependencies.storedResultGraceMs ?? DEFAULT_STORED_RESULT_GRACE_MS
  );
  const directSharedAudioPromise = storedGracePromise.then((candidate) => candidate
    ? null
    : directSharedAudioCandidate(selectedText, options, dependencies, trace));
  const localPlayablePromise = storedGracePromise.then((candidate) => candidate
    ? candidate
    : localPlayableCandidate(selectedText, options, dependencies, trace));
  const localAudioPromise = localPlayablePromise.then((candidate) => getBestAudio(candidate?.result)?.url
    ? candidate
    : null);
  const waitMs = dependencies.directSharedAudioWaitMs ?? DEFAULT_DIRECT_SHARED_AUDIO_WAIT_MS;

  return await firstNonNullResult([
    promiseWithinWait(storedCandidatePromise, waitMs),
    promiseWithinWait(directSharedAudioPromise, waitMs),
    promiseWithinWait(localAudioPromise, waitMs)
  ]) || await localPlayablePromise;
}

async function storedAudioCandidate(selectedText, dependencies = {}, trace = null) {
  try {
    const result = await readStoredPlayableResult(selectedText, dependencies, trace);
    if (!result) {
      return null;
    }

    recordStoredResultHit(selectedText, result, dependencies, trace);
    return {
      result,
      localResult: result,
      source: "stored"
    };
  } catch (error) {
    dependencies.recordDebugEvent?.("stored-result:error", {
      text: selectedText,
      error: error?.message || String(error || "Unknown storage error"),
      trace
    });
    return null;
  }
}

async function directSharedAudioCandidate(selectedText, options = {}, dependencies = {}, trace = null) {
  const result = await requestPreparedOrDirectSharedAudio(selectedText, {
    rate: options.rate,
    trace
  }, dependencies);
  return getBestAudio(result)?.url
    ? {
      result,
      localResult: result,
      source: "direct-shared-audio"
    }
    : null;
}

async function localPlayableCandidate(selectedText, options = {}, dependencies = {}, trace = null) {
  const localResult = await dependencies.resolveSelection(selectedText, {
    ...options,
    useOnline: false
  });
  const playableOptions = options.useOnline === true ? {
    ...options,
    useOnline: true,
    trace
  } : {
    ...options,
    trace
  };
  const playableResult = await resolvePlayableResult(
    selectedText,
    localResult,
    immediatePlaybackOptions(playableOptions),
    dependencies
  );
  return playableResult
    ? {
      result: playableResult,
      localResult,
      source: "local"
    }
    : null;
}

async function promiseWithinWait(promise, waitMs) {
  const normalizedWaitMs = Math.max(0, Number(waitMs) || 0);
  if (!normalizedWaitMs || typeof setTimeout !== "function") {
    return promise;
  }

  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(null), normalizedWaitMs);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function waitForStoredResultGrace(storedResultPromise, waitMs) {
  return promiseWithinWait(storedResultPromise, waitMs);
}

function firstNonNullResult(promises = []) {
  const pending = promises.filter(Boolean);
  if (!pending.length) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let remaining = pending.length;
    pending.forEach((promise) => {
      Promise.resolve(promise)
        .then((value) => {
          if (value) {
            resolve(value);
            return;
          }

          remaining -= 1;
          if (!remaining) {
            resolve(null);
          }
        })
        .catch(() => {
          remaining -= 1;
          if (!remaining) {
            resolve(null);
          }
        });
    });
  });
}

async function readStoredPlayableResult(selectedText, dependencies = {}, trace = null) {
  const key = dependencies.lastResultKey || "lastResult";
  const stored = await dependencies.getStorage?.([key]) || {};
  const result = stored[key];
  const missReason = storedResultMissReason(result, selectedText);
  if (missReason) {
    recordStoredResultMiss(selectedText, result, missReason, dependencies, trace);
    return null;
  }

  return result;
}

function immediatePlaybackOptions(options = {}) {
  return options.useOnline === true
    ? options
    : {
      ...options,
      skipOnlineRetry: true
    };
}

function setStorageBestEffort(dependencies = {}, value = {}) {
  try {
    const stored = dependencies.setStorage?.(value);
    if (stored && typeof stored.catch === "function") {
      stored.catch(() => {});
    }
  } catch {
    // Storage bookkeeping should not block pronunciation.
  }
}

function recordStoredResultHit(selectedText, result = {}, dependencies = {}, trace = null) {
  const audio = getBestAudio(result);
  dependencies.recordDebugEvent?.("stored-result:hit", {
    text: selectedText,
    sourceStatus: result.sourceStatus || "",
    audioQuality: audio?.quality || "",
    urlHost: hostForUrl(audio?.url),
    trace
  });
}

function recordStoredResultMiss(selectedText, result = {}, reason = "", dependencies = {}, trace = null) {
  const audio = getBestAudio(result);
  dependencies.recordDebugEvent?.("stored-result:miss", {
    text: selectedText,
    reason,
    sourceStatus: result?.sourceStatus || "",
    storedDisplay: result?.display || result?.query || "",
    audioQuality: audio?.quality || "",
    trace
  });
}

function storedResultMissReason(result = {}, selectedText = "") {
  if (!result) {
    return "missing";
  }

  if (!getBestAudio(result)?.url) {
    return "no-audio";
  }

  if (!matchesSelection(result, selectedText)) {
    return "selection-mismatch";
  }

  return "";
}

function hostForUrl(value = "") {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

function matchesSelection(result = {}, selectedText = "") {
  const selectedKey = createLookupKey(selectedText);
  if (!selectedKey) {
    return false;
  }

  return [
    result.query,
    result.display,
    result.sourceForm,
    result.speakText,
    ...(Array.isArray(result.aliases) ? result.aliases : []),
    ...(Array.isArray(result.variants) ? result.variants : [])
  ].some((value) => createLookupKey(value) === selectedKey);
}

function createTrace(action) {
  const startedAt = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return {
    id: `background-${startedAt.toString(36)}-${random}`,
    source: "background",
    action,
    startedAt
  };
}

function startPreparingPlayback(dependencies = {}, trace = null) {
  try {
    const prepared = dependencies.preparePlayback?.(trace);
    if (prepared && typeof prepared.catch === "function") {
      prepared.catch(() => {});
    }
  } catch {
    // Playback can still prepare lazily if early setup fails.
  }
}
