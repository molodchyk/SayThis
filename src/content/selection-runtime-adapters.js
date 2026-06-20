(function installSayThisSelectionRuntimeAdapters() {
  if (globalThis.__sayThisSelectionRuntimeAdapters) {
    return;
  }

  function createSelectionRuntimeAdapters(chromeApi = globalThis.chrome) {
    const runtime = chromeApi?.runtime;
    const storage = chromeApi?.storage;
    return {
      getStorage: typeof storage?.local?.get === "function"
        ? (keys) => storage.local.get(keys)
        : null,
      addStorageChangedListener: typeof storage?.onChanged?.addListener === "function"
        ? (listener) => storage.onChanged.addListener(listener)
        : null,
      sendMessage: typeof runtime?.sendMessage === "function"
        ? (message) => runtime.sendMessage(message)
        : null
    };
  }

  globalThis.__sayThisSelectionRuntimeAdapters = {
    createSelectionRuntimeAdapters
  };
})();
