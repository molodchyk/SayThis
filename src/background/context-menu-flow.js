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

const DEFAULT_DIRECT_SHARED_AUDIO_WAIT_MS = 120;
const DEFAULT_DIRECT_SHARED_AUDIO_FALLBACK_WAIT_MS = 1200;
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

    const candidate = await firstContextMenuAudioCandidate(selectedText, tab?.id, options, dependencies, trace);
    if (candidate?.result) {
      const storedResult = candidate.result;
      setStorageBestEffort(dependencies, {
        [dependencies.lastResultKey || "lastResult"]: storedResult
      });
      await dependencies.playResolvedResult?.(storedResult, tab?.id, trace);
      return { handled: true, result: storedResult, reusedStored: true };
    }

    const result = await dependencies.resolveSelection(selectedText, immediateResolveOptions(options));
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
  const immediateCandidate = await firstContextMenuAudioCandidate(selectedText, tabId, options, dependencies, trace);
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

async function firstContextMenuAudioCandidate(selectedText, tabId, options = {}, dependencies = {}, trace = null) {
  const raceStartedAt = Date.now();
  recordCandidateEvent(dependencies, trace, "context-candidate:race-start", {
    text: selectedText
  });
  const visibleCandidatePromise = visibleAudioCandidate(selectedText, tabId, dependencies, trace);
  const storedCandidatePromise = storedAudioCandidate(selectedText, dependencies, trace);
  const quickLocalCandidatePromise = firstNonNullResult([
    waitForVisibleResultGrace(
      visibleCandidatePromise,
      dependencies.visibleResultGraceMs ?? DEFAULT_STORED_RESULT_GRACE_MS
    ),
    waitForStoredResultGrace(
      storedCandidatePromise,
      dependencies.storedResultGraceMs ?? DEFAULT_STORED_RESULT_GRACE_MS
    )
  ]);
  const directSharedAudioPromise = quickLocalCandidatePromise.then((candidate) => candidate
    ? null
    : directSharedAudioCandidate(selectedText, options, dependencies, trace));
  const localPlayablePromise = quickLocalCandidatePromise.then((candidate) => candidate
    ? candidate
    : localPlayableCandidate(selectedText, options, dependencies, trace));
  const localAudioPromise = localPlayablePromise.then((candidate) => getBestAudio(candidate?.result)?.url
    ? candidate
    : null);
  const waitMs = dependencies.directSharedAudioWaitMs ?? DEFAULT_DIRECT_SHARED_AUDIO_WAIT_MS;

  const fastSelected = await firstNonNullResult([
    promiseWithinWait(visibleCandidatePromise, waitMs),
    promiseWithinWait(storedCandidatePromise, waitMs),
    promiseWithinWait(directSharedAudioPromise, waitMs),
    promiseWithinWait(localAudioPromise, waitMs)
  ]);
  const selected = fastSelected || await fallbackAudioCandidate(
    directSharedAudioPromise,
    localAudioPromise,
    localPlayablePromise,
    dependencies
  );
  recordCandidateEvent(dependencies, trace, "context-candidate:race-result", {
    text: selectedText,
    elapsedMs: Date.now() - raceStartedAt,
    selected: selected?.source || "none",
    hit: Boolean(getBestAudio(selected?.result)?.url)
  });
  return selected;
}

async function fallbackAudioCandidate(
  directSharedAudioPromise,
  localAudioPromise,
  localPlayablePromise,
  dependencies = {}
) {
  const fallbackWaitMs = dependencies.directSharedAudioFallbackWaitMs ??
    DEFAULT_DIRECT_SHARED_AUDIO_FALLBACK_WAIT_MS;
  return await firstNonNullResult([
    promiseWithinWait(directSharedAudioPromise, fallbackWaitMs),
    promiseWithinWait(localAudioPromise, fallbackWaitMs)
  ]) || await localPlayablePromise;
}

async function visibleAudioCandidate(selectedText, tabId, dependencies = {}, trace = null) {
  if (!tabId || typeof dependencies.getVisibleResultOnTab !== "function") {
    recordCandidateEvent(dependencies, trace, "context-candidate:visible-skip", {
      text: selectedText,
      reason: tabId ? "missing-adapter" : "missing-tab"
    });
    return null;
  }

  const startedAt = Date.now();
  recordCandidateEvent(dependencies, trace, "context-candidate:visible-start", {
    text: selectedText
  });
  try {
    const result = await dependencies.getVisibleResultOnTab(tabId);
    const missReason = storedResultMissReason(result, selectedText);
    if (missReason) {
      recordStoredResultMiss(selectedText, result, `visible-${missReason}`, dependencies, trace);
      recordCandidateEvent(dependencies, trace, "context-candidate:visible-result", {
        text: selectedText,
        elapsedMs: Date.now() - startedAt,
        hit: false,
        reason: missReason,
        sourceStatus: result?.sourceStatus || "",
        audioQuality: getBestAudio(result)?.quality || ""
      });
      return null;
    }

    dependencies.recordDebugEvent?.("visible-result:hit", {
      text: selectedText,
      sourceStatus: result.sourceStatus || "",
      audioQuality: getBestAudio(result)?.quality || "",
      trace
    });
    recordCandidateEvent(dependencies, trace, "context-candidate:visible-result", {
      text: selectedText,
      elapsedMs: Date.now() - startedAt,
      hit: true,
      sourceStatus: result.sourceStatus || "",
      audioQuality: getBestAudio(result)?.quality || ""
    });
    return {
      result,
      localResult: result,
      source: "visible"
    };
  } catch (error) {
    dependencies.recordDebugEvent?.("visible-result:error", {
      text: selectedText,
      error: error?.message || String(error || "Unknown visible result error"),
      trace
    });
    recordCandidateEvent(dependencies, trace, "context-candidate:visible-result", {
      text: selectedText,
      elapsedMs: Date.now() - startedAt,
      hit: false,
      reason: "error",
      error: error?.message || String(error || "Unknown visible result error")
    });
    return null;
  }
}

async function storedAudioCandidate(selectedText, dependencies = {}, trace = null) {
  const startedAt = Date.now();
  recordCandidateEvent(dependencies, trace, "context-candidate:stored-start", {
    text: selectedText
  });
  try {
    const result = await readStoredPlayableResult(selectedText, dependencies, trace);
    if (!result) {
      recordCandidateEvent(dependencies, trace, "context-candidate:stored-result", {
        text: selectedText,
        elapsedMs: Date.now() - startedAt,
        hit: false
      });
      return null;
    }

    recordStoredResultHit(selectedText, result, dependencies, trace);
    recordCandidateEvent(dependencies, trace, "context-candidate:stored-result", {
      text: selectedText,
      elapsedMs: Date.now() - startedAt,
      hit: true,
      sourceStatus: result.sourceStatus || "",
      audioQuality: getBestAudio(result)?.quality || "",
      urlHost: hostForUrl(getBestAudio(result)?.url)
    });
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
    recordCandidateEvent(dependencies, trace, "context-candidate:stored-result", {
      text: selectedText,
      elapsedMs: Date.now() - startedAt,
      hit: false,
      reason: "error",
      error: error?.message || String(error || "Unknown storage error")
    });
    return null;
  }
}

async function directSharedAudioCandidate(selectedText, options = {}, dependencies = {}, trace = null) {
  const startedAt = Date.now();
  recordCandidateEvent(dependencies, trace, "context-candidate:shared-start", {
    text: selectedText
  });
  const result = await requestPreparedOrDirectSharedAudio(selectedText, {
    rate: options.rate,
    trace
  }, dependencies);
  const audio = getBestAudio(result);
  recordCandidateEvent(dependencies, trace, "context-candidate:shared-result", {
    text: selectedText,
    elapsedMs: Date.now() - startedAt,
    hit: Boolean(audio?.url),
    sourceStatus: result?.sourceStatus || "",
    audioQuality: audio?.quality || "",
    urlHost: hostForUrl(audio?.url)
  });
  return getBestAudio(result)?.url
    ? {
      result,
      localResult: result,
      source: "direct-shared-audio"
    }
    : null;
}

async function localPlayableCandidate(selectedText, options = {}, dependencies = {}, trace = null) {
  const startedAt = Date.now();
  recordCandidateEvent(dependencies, trace, "context-candidate:local-start", {
    text: selectedText
  });
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
  const audio = getBestAudio(playableResult);
  recordCandidateEvent(dependencies, trace, "context-candidate:local-result", {
    text: selectedText,
    elapsedMs: Date.now() - startedAt,
    hit: Boolean(audio?.url),
    sourceStatus: playableResult?.sourceStatus || "",
    audioQuality: audio?.quality || "",
    urlHost: hostForUrl(audio?.url)
  });
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

async function waitForVisibleResultGrace(visibleResultPromise, waitMs) {
  return promiseWithinWait(visibleResultPromise, waitMs);
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
      skipOnlineRetry: true,
      sharedAudioLocalOnly: true
    };
}

function immediateResolveOptions(options = {}) {
  return options.useOnline === true
    ? options
    : {
      ...options,
      useOnline: false
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

function recordCandidateEvent(dependencies = {}, trace = null, kind = "", payload = {}) {
  dependencies.recordDebugEvent?.(kind, {
    ...payload,
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
