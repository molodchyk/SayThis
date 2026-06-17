export function createOffscreenRuntimeAdapters(chromeApi = globalThis.chrome) {
  const runtime = chromeApi?.runtime;

  return {
    addMessageListener: typeof runtime?.onMessage?.addListener === "function"
      ? (listener) => runtime.onMessage.addListener(listener)
      : null
  };
}

export function addOffscreenMessageListener(handler, dependencies = createOffscreenRuntimeAdapters()) {
  if (typeof dependencies.addMessageListener !== "function") {
    return false;
  }

  dependencies.addMessageListener((message, _sender, sendResponse) => handler(message, sendResponse));
  return true;
}
