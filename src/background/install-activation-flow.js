export const SELECTION_LISTENER_FILE = "src/selection-listener.js";
export const SELECTION_LISTENER_FILES = [
  "src/content/selection-runtime-adapters.js",
  "src/content/selection-floating-controls.js",
  SELECTION_LISTENER_FILE
];

export async function registerContextMenus(definitions = [], dependencies = {}) {
  try {
    await dependencies.removeAllContextMenus?.();
  } catch {
    // Menu cleanup is best-effort; creation below can still succeed.
  }

  for (const item of definitions) {
    dependencies.createContextMenu?.(item);
  }
}

export async function activateSelectionListenerOnOpenTabs(dependencies = {}) {
  const startedAt = Date.now();
  dependencies.recordDebugEvent?.("selection-listener:activate:start", {});

  let tabs = [];
  try {
    tabs = await dependencies.queryTabs?.({}) || [];
  } catch (error) {
    dependencies.recordDebugEvent?.("selection-listener:activate:error", {
      elapsedMs: Date.now() - startedAt,
      error: error?.message || String(error || "Tab query failed")
    });
    return {
      injected: 0,
      failed: 0,
      skipped: 0,
      error: error?.message || String(error || "Tab query failed")
    };
  }

  let injected = 0;
  let failed = 0;
  let skipped = 0;
  if (typeof dependencies.executeScript !== "function") {
    skipped = tabs.length;
    const summary = {
      injected,
      failed,
      skipped,
      elapsedMs: Date.now() - startedAt
    };
    dependencies.recordDebugEvent?.("selection-listener:activate:result", summary);
    return summary;
  }

  for (const tab of tabs) {
    if (!Number.isFinite(tab?.id)) {
      skipped += 1;
      continue;
    }

    try {
      await dependencies.executeScript?.({
        target: { tabId: tab.id, allFrames: true },
        files: dependencies.listenerFiles ||
          (dependencies.listenerFile ? [dependencies.listenerFile] : SELECTION_LISTENER_FILES)
      });
      injected += 1;
    } catch {
      failed += 1;
    }
  }

  const summary = {
    injected,
    failed,
    skipped,
    elapsedMs: Date.now() - startedAt
  };
  dependencies.recordDebugEvent?.("selection-listener:activate:result", summary);
  return summary;
}
