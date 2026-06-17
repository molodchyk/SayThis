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
    await dependencies.setStorage?.({
      [dependencies.lastSelectionKey || "lastSelection"]: selectedText,
      [dependencies.lastSourceKey || "lastSource"]: options.source || "keyboard"
    });

    const result = await dependencies.resolveSelection?.(selectedText, {
      useOnline: options.useOnline
    });
    await dependencies.playResolvedResult?.(result, tab.id);

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
