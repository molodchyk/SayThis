import {
  createLookupKey,
  getBestAudio
} from "../resolver-core.js";
import {
  resolvePlayableResult
} from "./pronunciation-playback-flow.js";

const DEFAULT_DIRECT_SHARED_AUDIO_WAIT_MS = 450;
const DEFAULT_STORED_RESULT_GRACE_MS = 10;

const KEYBOARD_COMMANDS = {
  local: "pronounce-selection",
  online: "pronounce-selection-online"
};

export async function handleActiveSelectionCommandName(command, dependencies = {}) {
  const options = activeSelectionOptionsForCommand(command);
  if (!options) {
    return { handled: false, reason: "unknown-command" };
  }

  return handleActiveSelectionCommand(options, dependencies);
}

export async function handleActiveSelectionCommand(options = {}, dependencies = {}) {
  const tab = await dependencies.getActiveTab?.();
  if (!tab?.id) {
    return { handled: false, reason: "no-active-tab" };
  }

  const selectedText = await dependencies.readSelectionFromTab?.(tab.id);
  if (!selectedText) {
    return { handled: false, reason: "empty-selection" };
  }

  try {
    const trace = createTrace(options.source || "keyboard");
    dependencies.recordDebugEvent?.("ui:keyboard-command", {
      text: selectedText,
      trace
    });
    startPreparingPlayback(dependencies, trace);

    await dependencies.setStorage?.({
      [dependencies.lastSelectionKey || "lastSelection"]: selectedText,
      [dependencies.lastSourceKey || "lastSource"]: options.source || "keyboard"
    });

    const tracedOptions = {
      ...options,
      trace
    };

    if (options.useOnline === true) {
      return await handleOnlineLookupAndPronounce(selectedText, tab.id, tracedOptions, dependencies, trace);
    }

    const candidate = await firstActiveSelectionAudioCandidate(selectedText, tracedOptions, dependencies, trace);
    if (candidate?.result) {
      const storedResult = candidate.result;
      await dependencies.playResolvedResult?.(storedResult, tab.id, trace);
      return { handled: true, result: storedResult, reusedStored: true };
    }

    const result = await dependencies.resolveSelection?.(selectedText, {
      useOnline: options.useOnline,
      trace
    });
    const playableResult = await resolvePlayableResult(selectedText, result, {
      useOnline: options.useOnline,
      trace
    }, dependencies);
    await dependencies.playResolvedResult?.(playableResult, tab.id, trace);

    return { handled: true, result: playableResult };
  } catch (error) {
    return {
      handled: false,
      reason: "resolve-failed",
      error
    };
  }
}

export function activeSelectionOptionsForCommand(command) {
  if (command === KEYBOARD_COMMANDS.local) {
    return { source: "keyboard" };
  }

  if (command === KEYBOARD_COMMANDS.online) {
    return {
      source: "keyboard-online",
      useOnline: true
    };
  }

  return null;
}

async function handleOnlineLookupAndPronounce(selectedText, tabId, options = {}, dependencies = {}, trace = null) {
  const immediateCandidate = await firstActiveSelectionAudioCandidate(selectedText, options, dependencies, trace);
  const localResult = immediateCandidate?.localResult || immediateCandidate?.result || null;
  const immediateResult = immediateCandidate?.result || null;

  const playedImmediate = Boolean(getBestAudio(immediateResult)?.url);

  if (playedImmediate) {
    await dependencies.playResolvedResult?.(immediateResult, tabId, trace);
  }

  try {
    const refreshStartedAt = Date.now();
    dependencies.recordDebugEvent?.("online-refresh:start", {
      text: selectedText,
      immediateAudio: playedImmediate,
      trace
    });
    const onlineResult = await dependencies.resolveSelection?.(selectedText, {
      ...options,
      useOnline: true,
      localResult
    });
    const playableResult = await resolvePlayableResult(selectedText, onlineResult, {
      ...options,
      useOnline: true
    }, dependencies);
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

async function firstActiveSelectionAudioCandidate(selectedText, options = {}, dependencies = {}, trace = null) {
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
  const waitMs = dependencies.directSharedAudioWaitMs ?? DEFAULT_DIRECT_SHARED_AUDIO_WAIT_MS;

  return await firstNonNullResult([
    promiseWithinWait(storedCandidatePromise, waitMs),
    promiseWithinWait(directSharedAudioPromise, waitMs),
    promiseWithinWait(localPlayablePromise, waitMs)
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
  if (typeof dependencies.requestSharedAudio !== "function") {
    return null;
  }

  try {
    const result = await dependencies.requestSharedAudio(selectedText, null, compactOptions({
      rate: options.rate,
      trace,
      directLookup: true,
      skipRefresh: true
    }));
    return result
      ? {
        result,
        localResult: result,
        source: "direct-shared-audio"
      }
      : null;
  } catch {
    return null;
  }
}

async function localPlayableCandidate(selectedText, options = {}, dependencies = {}, trace = null) {
  const localResult = await dependencies.resolveSelection?.(selectedText, {
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
  const playableResult = await resolvePlayableResult(selectedText, localResult, playableOptions, dependencies);
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

function compactOptions(options = {}) {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined)
  );
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
