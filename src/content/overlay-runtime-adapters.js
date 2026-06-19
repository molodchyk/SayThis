(function installSayThisOverlayRuntimeAdapters() {
  if (globalThis.__sayThisOverlayRuntimeAdapters) {
    return;
  }

  function createOverlayRuntimeAdapters(chromeApi = globalThis.chrome) {
    const runtime = chromeApi?.runtime;
    return {
      addMessageListener: typeof runtime?.onMessage?.addListener === "function"
        ? (listener) => runtime.onMessage.addListener(listener)
        : null,
      sendMessage: typeof runtime?.sendMessage === "function"
        ? (message, callback) => runtime.sendMessage(message, callback)
        : null,
      lastError: () => runtime?.lastError
    };
  }

  function addShowResultListener(onShowResult, dependencies = createOverlayRuntimeAdapters()) {
    if (typeof dependencies.addMessageListener !== "function") {
      return false;
    }

    dependencies.addMessageListener((message, _sender, sendResponse) => {
      if (message?.type !== "SAYTHIS_SHOW_RESULT") {
        return false;
      }

      onShowResult?.(message.result, { autoPlay: Boolean(message.autoPlay) });
      sendResponse?.({ ok: true });
      return true;
    });
    return true;
  }

  function addVisibleResultListener(getVisibleResult, dependencies = createOverlayRuntimeAdapters()) {
    if (typeof dependencies.addMessageListener !== "function") {
      return false;
    }

    dependencies.addMessageListener((message, _sender, sendResponse) => {
      if (message?.type !== "SAYTHIS_GET_VISIBLE_RESULT") {
        return false;
      }

      const result = getVisibleResult?.();
      sendResponse?.({
        ok: true,
        result: result && typeof result === "object" ? result : null
      });
      return true;
    });
    return true;
  }

  function sendRuntimeMessage(message, dependencies = createOverlayRuntimeAdapters()) {
    return new Promise((resolve) => {
      if (typeof dependencies.sendMessage !== "function") {
        resolve({ ok: false, error: "Runtime messaging unavailable." });
        return;
      }

      dependencies.sendMessage(message, (response) => {
        const lastError = dependencies.lastError?.();
        if (lastError) {
          resolve({ ok: false, error: lastError.message || String(lastError) });
          return;
        }

        resolve(response || { ok: false, error: "No response." });
      });
    });
  }

  globalThis.__sayThisOverlayRuntimeAdapters = {
    addVisibleResultListener,
    addShowResultListener,
    createOverlayRuntimeAdapters,
    sendRuntimeMessage
  };
})();
