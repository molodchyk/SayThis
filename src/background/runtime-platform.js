export const BACKGROUND_OFFSCREEN_AUDIO_URL = "src/offscreen-audio.html";

export const BACKGROUND_STORAGE_KEYS = Object.freeze({
  approvedCommunityEntries: "approvedCommunityEntries",
  communityEntries: "communityEntries",
  communityPullState: "communityPullState",
  credentials: "credentials",
  lastResult: "lastResult",
  lastSelection: "lastSelection",
  lastSource: "lastSource",
  resultCache: "resultCache",
  syncQueue: "syncQueue",
  syncSummary: "syncSummary",
  settings: "settings"
});

export function createBackgroundPlatformAdapters(chromeApi = globalThis.chrome, environment = globalThis) {
  const storage = chromeApi?.storage?.local;
  const runtime = chromeApi?.runtime;
  const contextMenus = chromeApi?.contextMenus;
  const commands = chromeApi?.commands;
  const offscreen = chromeApi?.offscreen;
  const scripting = chromeApi?.scripting;
  const tabs = chromeApi?.tabs;
  const tts = chromeApi?.tts;

  return {
    addCommandListener: listener => commands?.onCommand?.addListener?.(listener),
    addContextMenuClickedListener: listener => contextMenus?.onClicked?.addListener?.(listener),
    addInstalledListener: listener => runtime?.onInstalled?.addListener?.(listener),
    addMessageListener: listener => runtime?.onMessage?.addListener?.(listener),
    createContextMenu: item => contextMenus?.create?.(item),
    createOffscreenDocument: options => offscreen?.createDocument?.(options),
    executeScript: details => scripting?.executeScript?.(details),
    fetch: url => environment.fetch?.(url),
    getRuntimeUrl: url => runtime?.getURL?.(url) || url,
    getStorage: keys => storage?.get?.(keys),
    hasOffscreenAudioSupport: () => Boolean(offscreen),
    hasOffscreenDocument: typeof offscreen?.hasDocument === "function"
      ? () => offscreen.hasDocument()
      : null,
    matchClients: () => typeof environment.clients?.matchAll === "function"
      ? environment.clients.matchAll()
      : [],
    queryTabs: query => tabs?.query?.(query),
    sendRuntimeMessage: message => runtime?.sendMessage?.(message),
    sendTabMessage: (tabId, message) => tabs?.sendMessage?.(tabId, message),
    setStorage: value => storage?.set?.(value),
    speakTts: (text, options) => tts?.speak?.(text, options),
    stopTts: () => tts?.stop?.()
  };
}

export function createPlaybackSurfacePlatformDependencies(platform = {}, storageKeys = BACKGROUND_STORAGE_KEYS) {
  return {
    offscreenAudioUrl: BACKGROUND_OFFSCREEN_AUDIO_URL,
    getStorage: platform.getStorage,
    stopTts: platform.stopTts,
    speakTts: platform.speakTts,
    hasOffscreenAudioSupport: platform.hasOffscreenAudioSupport,
    hasOffscreenDocument: platform.hasOffscreenDocument,
    createOffscreenDocument: platform.createOffscreenDocument,
    sendRuntimeMessage: platform.sendRuntimeMessage,
    executeScript: platform.executeScript,
    sendTabMessage: platform.sendTabMessage,
    getRuntimeUrl: platform.getRuntimeUrl,
    matchClients: platform.matchClients,
    storageKeys
  };
}

export function createRuntimeAdapterPlatformDependencies(platform = {}, storageKeys = BACKGROUND_STORAGE_KEYS) {
  return {
    getRuntimeUrl: platform.getRuntimeUrl,
    fetch: platform.fetch,
    queryTabs: platform.queryTabs,
    executeScript: platform.executeScript,
    setStorage: platform.setStorage,
    storageKeys
  };
}
