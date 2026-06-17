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
    await dependencies.setStorage?.({
      [dependencies.lastResultKey || "lastResult"]: result
    });
    await dependencies.playResolvedResult?.(result, tab?.id);

    return { handled: true, result };
  } catch (error) {
    dependencies.speakFallback?.(selectedText);
    return {
      handled: false,
      reason: "resolve-failed",
      error
    };
  }
}
