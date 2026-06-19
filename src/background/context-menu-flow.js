import {
  createLookupKey,
  getBestAudio
} from "../resolver-core.js";
import {
  resolvePlayableResult
} from "./pronunciation-playback-flow.js";

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

    await dependencies.setStorage?.({
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

    const storedResult = await readStoredPlayableResult(selectedText, dependencies, trace);
    if (storedResult) {
      recordStoredResultHit(selectedText, storedResult, dependencies, trace);
      await dependencies.setStorage?.({
        [dependencies.lastResultKey || "lastResult"]: storedResult
      });
      await dependencies.playResolvedResult?.(storedResult, tab?.id, trace);
      return { handled: true, result: storedResult, reusedStored: true };
    }

    const result = await dependencies.resolveSelection(selectedText, options);
    const playableResult = await resolvePlayableResult(selectedText, result, options, dependencies);
    await dependencies.setStorage?.({
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
  const storedResult = await readStoredPlayableResult(selectedText, dependencies, trace);
  if (storedResult) {
    recordStoredResultHit(selectedText, storedResult, dependencies, trace);
  }

  let localResult = storedResult;
  let immediateResult = storedResult;

  if (!immediateResult) {
    localResult = await dependencies.resolveSelection(selectedText, {
      ...options,
      useOnline: false
    });
    immediateResult = await resolvePlayableResult(selectedText, localResult, {
      ...options,
      useOnline: true,
      trace
    }, dependencies);
  }

  const playedImmediate = Boolean(getBestAudio(immediateResult)?.url);

  if (playedImmediate) {
    await dependencies.setStorage?.({
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
    await dependencies.setStorage?.({
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
