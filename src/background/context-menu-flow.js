import {
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

    await dependencies.setStorage?.({
      lastSelection: selectedText,
      lastSource: action.source
    });

    const options = action.options || {};
    if (options.useOnline === true) {
      return await handleOnlineLookupAndPronounce(selectedText, tab?.id, options, dependencies, trace);
    }

    const result = await dependencies.resolveSelection(selectedText, options);
    const playableResult = await resolvePlayableResult(selectedText, result, action.options || {}, dependencies);
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
  const localResult = await dependencies.resolveSelection(selectedText, {
    ...options,
    useOnline: false
  });
  const immediateResult = await resolvePlayableResult(selectedText, localResult, {
    ...options,
    useOnline: true,
    trace
  }, dependencies);
  const playedImmediate = Boolean(getBestAudio(immediateResult)?.url);

  if (playedImmediate) {
    await dependencies.setStorage?.({
      [dependencies.lastResultKey || "lastResult"]: immediateResult
    });
    await dependencies.playResolvedResult?.(immediateResult, tabId, trace);
  }

  try {
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

    if (playedImmediate) {
      await dependencies.showResultOnTab?.(tabId, playableResult);
    } else {
      await dependencies.playResolvedResult?.(playableResult, tabId, trace);
    }

    return { handled: true, result: playableResult };
  } catch (error) {
    if (playedImmediate) {
      return { handled: true, result: immediateResult, onlineError: error };
    }

    throw error;
  }
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
