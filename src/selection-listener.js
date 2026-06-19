(function installSayThisSelectionListener() {
  if (window.__sayThisSelectionListenerReady) {
    return;
  }
  window.__sayThisSelectionListenerReady = true;

  const MESSAGE_TYPE_SPEAK = "SAYTHIS_SPEAK";
  const MESSAGE_TYPE_PREPARE_PLAYBACK = "SAYTHIS_PREPARE_PLAYBACK";
  const SETTINGS_KEY = "settings";
  const SELECTION_CHANGE_DEBOUNCE_MS = 160;
  const SELECTION_PREPARE_DEBOUNCE_MS = 90;
  const COMMITTED_SELECTION_DEBOUNCE_MS = 0;
  const REPEAT_SELECTION_COOLDOWN_MS = 1200;
  const PLAYBACK_PRIME_COOLDOWN_MS = 3000;
  const MAX_AUTO_TEXT_LENGTH = 80;
  const MAX_AUTO_WORDS = 5;
  const chromeApi = globalThis.chrome;

  let timerId = null;
  let prepareTimerId = null;
  let scheduledCheckAt = 0;
  let scheduledCheckMode = "";
  let lastSentKey = "";
  let lastSentAt = 0;
  let lastPreparedKey = "";
  let lastPreparedAt = 0;
  let lastPreparedTrace = null;
  let lastPrimeAt = 0;
  let primePlaybackPromise = null;
  let lastSettings = null;
  let settingsPromise = null;

  readSettings();

  document.addEventListener("selectionchange", () => {
    const selectedText = readSelectedText();
    if (!selectedText) {
      clearScheduledCheck();
      clearScheduledPrepare();
      resetSelectionTracking();
      return;
    }

    if (!hasCommittedCheckPending()) {
      primePlaybackSurface();
    }
    scheduleSelectionCheck(SELECTION_CHANGE_DEBOUNCE_MS, { stable: true });
  }, true);
  document.addEventListener("pointerup", () => scheduleSelectionCheck(COMMITTED_SELECTION_DEBOUNCE_MS), true);
  document.addEventListener("mouseup", () => scheduleSelectionCheck(COMMITTED_SELECTION_DEBOUNCE_MS), true);
  document.addEventListener("keyup", () => scheduleSelectionCheck(COMMITTED_SELECTION_DEBOUNCE_MS), true);
  document.addEventListener("touchend", () => scheduleSelectionCheck(COMMITTED_SELECTION_DEBOUNCE_MS), true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      clearScheduledCheck();
      clearScheduledPrepare();
    }
  });

  chromeApi?.storage?.onChanged?.addListener?.((changes, areaName) => {
    if (areaName === "local" && Object.prototype.hasOwnProperty.call(changes, SETTINGS_KEY)) {
      lastSettings = changes[SETTINGS_KEY].newValue || {};
      settingsPromise = null;
    }
  });

  function scheduleSelectionCheck(delayMs, options = {}) {
    const now = Date.now();
    const dueAt = now + Math.max(0, Number(delayMs) || 0);
    const mode = options.stable === true ? "stable" : "committed";
    if (mode === "committed") {
      clearScheduledPrepare();
      preparePotentialSelection();
    } else {
      schedulePotentialSelectionPreparation(SELECTION_PREPARE_DEBOUNCE_MS);
    }

    if (timerId !== null && scheduledCheckMode === "committed" && mode === "stable") {
      return;
    }

    if (timerId !== null && scheduledCheckMode === "committed" && scheduledCheckAt && scheduledCheckAt <= dueAt) {
      return;
    }

    clearScheduledCheck();
    scheduledCheckAt = dueAt;
    scheduledCheckMode = mode;
    timerId = setTimeout(() => {
      timerId = null;
      scheduledCheckAt = 0;
      scheduledCheckMode = "";
      speakStableSelection();
    }, Math.max(0, dueAt - now));
  }

  function clearScheduledCheck() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
      scheduledCheckAt = 0;
      scheduledCheckMode = "";
    }
  }

  function schedulePotentialSelectionPreparation(delayMs) {
    clearScheduledPrepare();
    prepareTimerId = setTimeout(() => {
      prepareTimerId = null;
      preparePotentialSelection();
    }, Math.max(0, Number(delayMs) || 0));
  }

  function clearScheduledPrepare() {
    if (prepareTimerId !== null) {
      clearTimeout(prepareTimerId);
      prepareTimerId = null;
    }
  }

  function hasCommittedCheckPending() {
    return timerId !== null && scheduledCheckMode === "committed";
  }

  function resetSelectionTracking() {
    lastSentKey = "";
    lastSentAt = 0;
    lastPreparedKey = "";
    lastPreparedAt = 0;
    lastPreparedTrace = null;
  }

  function primePlaybackSurface() {
    const now = Date.now();
    if (primePlaybackPromise || now - lastPrimeAt < PLAYBACK_PRIME_COOLDOWN_MS) {
      return;
    }

    primePlaybackPromise = (async () => {
      if (!selectToHearEnabled(await readSettings())) {
        return;
      }

      lastPrimeAt = Date.now();
      sendRuntimeMessage({
        type: MESSAGE_TYPE_PREPARE_PLAYBACK,
        trace: createTrace("select-to-hear-prime")
      });
    })().finally(() => {
      primePlaybackPromise = null;
    });
  }

  async function speakStableSelection() {
    const selectedText = readSelectedText();
    if (!selectedText) {
      resetSelectionTracking();
      return;
    }

    if (!isAutoPronounceCandidate(selectedText)) {
      return;
    }

    const key = lookupKey(selectedText);
    if (!key || isSuppressedRepeat(key)) {
      return;
    }

    if (!selectToHearEnabled(await readSettings())) {
      return;
    }

    lastSentKey = key;
    lastSentAt = Date.now();
    const trace = preparedTraceForKey(key) || createTrace("select-to-hear");
    sendRuntimeMessage({
      type: MESSAGE_TYPE_SPEAK,
      text: selectedText,
      rate: 0.82,
      trace
    }).then((response) => {
      if (!response?.ok) {
        lastSentKey = "";
        lastSentAt = 0;
      }
    });
  }

  async function preparePotentialSelection() {
    const selectedText = readSelectedText();
    if (!selectedText || !isAutoPronounceCandidate(selectedText)) {
      return;
    }

    const key = lookupKey(selectedText);
    if (!key || isSuppressedRepeat(key) || isSuppressedPrepare(key)) {
      return;
    }

    const trace = createTrace("select-to-hear");
    lastPreparedKey = key;
    lastPreparedAt = Date.now();
    lastPreparedTrace = trace;

    if (!selectToHearEnabled(await readSettings())) {
      if (lastPreparedTrace === trace) {
        lastPreparedKey = "";
        lastPreparedAt = 0;
        lastPreparedTrace = null;
      }
      return;
    }

    sendRuntimeMessage({
      type: MESSAGE_TYPE_PREPARE_PLAYBACK,
      text: selectedText,
      rate: 0.82,
      trace
    });
  }

  function isSuppressedRepeat(key) {
    if (key !== lastSentKey) {
      return false;
    }

    return Date.now() - lastSentAt < REPEAT_SELECTION_COOLDOWN_MS;
  }

  function isSuppressedPrepare(key) {
    if (key !== lastPreparedKey) {
      return false;
    }

    return Date.now() - lastPreparedAt < REPEAT_SELECTION_COOLDOWN_MS;
  }

  function preparedTraceForKey(key) {
    if (key !== lastPreparedKey || !lastPreparedTrace) {
      return null;
    }

    if (Date.now() - lastPreparedAt > REPEAT_SELECTION_COOLDOWN_MS) {
      return null;
    }

    return lastPreparedTrace;
  }

  function readSelectedText() {
    const editableText = readEditableSelection();
    if (editableText) {
      return normalizeSelection(editableText);
    }

    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed || isSayThisOverlaySelection(selection)) {
      return "";
    }

    return normalizeSelection(selection.toString());
  }

  function readEditableSelection() {
    const element = document.activeElement;
    if (!isTextSelectionControl(element)) {
      return "";
    }

    const start = Number(element.selectionStart);
    const end = Number(element.selectionEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return "";
    }

    return String(element.value || "").slice(start, end);
  }

  function isTextSelectionControl(element) {
    if (!element) {
      return false;
    }

    const tagName = String(element.tagName || "").toLowerCase();
    if (tagName === "textarea") {
      return true;
    }

    if (tagName !== "input") {
      return false;
    }

    const type = String(element.type || "text").toLowerCase();
    return ["", "email", "search", "tel", "text", "url"].includes(type);
  }

  function isSayThisOverlaySelection(selection) {
    const nodes = [
      selection.anchorNode,
      selection.focusNode
    ].filter(Boolean);
    return nodes.some((node) => {
      const root = node.getRootNode?.();
      return String(root?.host?.tagName || "").toLowerCase() === "saythis-overlay";
    });
  }

  function isAutoPronounceCandidate(value) {
    const text = normalizeSelection(value);
    if (text.length < 2 || text.length > MAX_AUTO_TEXT_LENGTH) {
      return false;
    }

    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > MAX_AUTO_WORDS) {
      return false;
    }

    if (!/[\p{L}]/u.test(text)) {
      return false;
    }

    return !(words.length > 1 && /[.!?。！？]$/.test(text));
  }

  async function readSettings() {
    if (lastSettings) {
      return lastSettings;
    }

    if (!settingsPromise) {
      settingsPromise = readStoredSettings();
    }

    return settingsPromise;
  }

  async function readStoredSettings() {
    try {
      const stored = await chromeApi?.storage?.local?.get?.([SETTINGS_KEY]);
      lastSettings = stored?.[SETTINGS_KEY] || {};
    } catch {
      lastSettings = {};
    } finally {
      settingsPromise = null;
    }

    return lastSettings;
  }

  function selectToHearEnabled(settings = {}) {
    return settings.selectToHear !== false;
  }

  function sendRuntimeMessage(message) {
    if (typeof chromeApi?.runtime?.sendMessage !== "function") {
      return Promise.resolve({ ok: false });
    }

    try {
      const response = chromeApi.runtime.sendMessage(message);
      return response && typeof response.then === "function"
        ? response.catch(() => ({ ok: false }))
        : Promise.resolve(response).catch(() => ({ ok: false }));
    } catch {
      return Promise.resolve({ ok: false });
    }
  }

  function createTrace(action) {
    const startedAt = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return {
      id: `selection-${startedAt.toString(36)}-${random}`,
      source: "content-selection",
      action,
      startedAt
    };
  }

  function lookupKey(value) {
    return normalizeSelection(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
      .replace(/[\s\-_]+/g, " ")
      .toLocaleLowerCase();
  }

  function normalizeSelection(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  }
})();
