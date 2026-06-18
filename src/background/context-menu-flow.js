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
    await dependencies.setStorage?.({
      lastSelection: selectedText,
      lastSource: action.source
    });

    const result = await dependencies.resolveSelection(selectedText, action.options || {});
    const playableResult = await resolvePlayableResult(selectedText, result, action.options || {}, dependencies);
    await dependencies.setStorage?.({
      [dependencies.lastResultKey || "lastResult"]: playableResult
    });
    await dependencies.playResolvedResult?.(playableResult, tab?.id);

    return { handled: true, result: playableResult };
  } catch (error) {
    dependencies.speakFallback?.(selectedText);
    return {
      handled: false,
      reason: "resolve-failed",
      error
    };
  }
}
