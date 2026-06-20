(function installSayThisSelectionListener() {
  if (window.__sayThisSelectionListenerReady) {
    return;
  }
  window.__sayThisSelectionListenerReady = true;

  const MESSAGE_TYPE_SPEAK = "SAYTHIS_SPEAK";
  const MESSAGE_TYPE_PREPARE_PLAYBACK = "SAYTHIS_PREPARE_PLAYBACK";
  const SETTINGS_KEY = "settings";
  const SELECTION_CHANGE_DEBOUNCE_MS = 40;
  const SELECTION_PREPARE_DEBOUNCE_MS = 30;
  const COMMITTED_SELECTION_DEBOUNCE_MS = 0;
  const LATE_COMMITTED_SELECTION_DEBOUNCE_MS = 25;
  const REPEAT_SELECTION_COOLDOWN_MS = 350;
  const PREPARED_SELECTION_TTL_MS = 1200;
  const PLAYBACK_PRIME_COOLDOWN_MS = 3000;
  const MAX_AUTO_TEXT_LENGTH = 120;
  const MAX_AUTO_WORDS = 8;
  const MAX_ORDINARY_AUTO_WORDS = 5;
  const NAME_CONNECTOR_WORDS = new Set(["a", "al", "and", "ap", "bin", "da", "de", "del", "der", "di", "du", "el", "ibn", "in", "la", "le", "of", "saint", "san", "santa", "st", "the", "van", "von"]);
  const EDGE_SELECTED_TEXT_PUNCTUATION =
    /^[\s"'`([{<\u00a1\u00ab\u00bf\u2010-\u2015\u2018-\u201f\u2039\u3008\u300a\u300c\u300e\u3010\u3014\u3016\u3018\u301a\uff08]+|[\s"'`)>\]},.;:!?\u00bb\u2010-\u2015\u2018-\u201f\u2026\u203a\u3002\u3009\u300b\u300d\u300f\u3011\u3015\u3017\u3019\u301b\uff09]+$/g;
  const runtimeAdapters = globalThis.__sayThisSelectionRuntimeAdapters
    ?.createSelectionRuntimeAdapters?.() || {};
  const selectionControls = globalThis.__sayThisSelectionFloatingControls
    ?.createSelectionFloatingControls?.({
      document,
      window,
      onPlay: () => {
        speakStableSelection({
          force: true,
          trigger: "selection-play-button"
        }).catch(() => {});
      }
    }) || {
    showStatus() {},
    hideStatus() {},
    showPlayButton() {},
    hidePlayButton() {}
  };

  let timerId = null;
  let prepareTimerId = null;
  let scheduledCheckAt = 0;
  let scheduledCheckMode = "";
  let lastSentKey = "";
  let lastSentAt = 0;
  let lastSentSelectionStartedAt = 0;
  let lastPreparedKey = "";
  let lastPreparedAt = 0;
  let lastPreparedSentAt = 0;
  let lastPreparedTrace = null;
  let selectionGestureStartedAt = 0;
  let activeSelectionStartedAt = 0;
  let pointerSelectionInProgress = false;
  let keyboardSelectionInProgress = false;
  let lastPrimeAt = 0;
  let primePlaybackPromise = null;
  let lastSettings = null;
  let settingsPromise = null;

  readSettings();

  document.addEventListener("pointerdown", (event) => {
    if (isSayThisOverlayEvent(event)) {
      return;
    }

    markSelectionGestureStarted();
    pointerSelectionInProgress = true;
    primePlaybackSurface();
  }, true);
  document.addEventListener("selectstart", (event) => {
    if (isSayThisOverlayEvent(event)) {
      return;
    }

    markSelectionGestureStarted();
    primePlaybackSurface();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (isSayThisOverlayEvent(event)) {
      return;
    }

    if (isLikelyKeyboardSelection(event)) {
      markSelectionGestureStarted();
      keyboardSelectionInProgress = true;
      primePlaybackSurface();
    }
  }, true);
  document.addEventListener("selectionchange", () => {
    const selectedText = readSelectedText();
    if (!selectedText) {
      clearScheduledCheck();
      clearScheduledPrepare();
      selectionControls.hidePlayButton();
      resetSelectionTracking();
      return;
    }

    markActiveSelectionStarted();
    refreshSelectionPlayButton(selectedText);
    if (!hasCommittedCheckPending()) {
      primePlaybackSurface();
    }
    if (isSelectionGestureInProgress()) {
      schedulePotentialSelectionPreparation(SELECTION_PREPARE_DEBOUNCE_MS);
      return;
    }
    scheduleSelectionCheck(SELECTION_CHANGE_DEBOUNCE_MS, { stable: true });
  }, true);
  document.addEventListener("pointerup", scheduleCommittedSelectionCheck, true);
  document.addEventListener("mouseup", scheduleCommittedSelectionCheck, true);
  document.addEventListener("dblclick", scheduleCommittedSelectionCheck, true);
  document.addEventListener("select", scheduleCommittedSelectionCheck, true);
  document.addEventListener("keyup", scheduleKeyboardCommittedSelectionCheck, true);
  document.addEventListener("touchend", scheduleCommittedSelectionCheck, true);
  document.addEventListener("pointercancel", scheduleCanceledSelectionCheck, true);
  document.addEventListener("touchcancel", scheduleCanceledSelectionCheck, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      clearScheduledCheck();
      clearScheduledPrepare();
      clearSelectionGestureInProgress();
    }
  });

  runtimeAdapters.addStorageChangedListener?.((changes, areaName) => {
    if (areaName === "local" && Object.prototype.hasOwnProperty.call(changes, SETTINGS_KEY)) {
      lastSettings = changes[SETTINGS_KEY].newValue || {};
      settingsPromise = null;
      refreshSelectionPlayButtonFromCurrentSelection();
    }
  });

  function scheduleSelectionCheck(delayMs, options = {}) {
    const now = Date.now();
    const dueAt = now + Math.max(0, Number(delayMs) || 0);
    const mode = options.stable === true ? "stable" : "committed";
    if (mode === "committed") {
      clearScheduledPrepare();
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
    if (mode === "committed" && dueAt <= now) {
      speakStableSelection().catch(() => {});
      return;
    }

    scheduledCheckAt = dueAt;
    scheduledCheckMode = mode;
    timerId = setTimeout(() => {
      timerId = null;
      scheduledCheckAt = 0;
      scheduledCheckMode = "";
      speakStableSelection().catch(() => {});
    }, Math.max(0, dueAt - now));
  }

  function scheduleCommittedSelectionCheck(event) {
    if (isSayThisOverlayEvent(event)) {
      return;
    }

    markActiveSelectionStarted();
    clearSelectionGestureInProgress();
    refreshSelectionPlayButtonFromCurrentSelection();
    scheduleSelectionCheck(committedSelectionDelayMs());
  }

  function scheduleKeyboardCommittedSelectionCheck(event) {
    if (isSayThisOverlayEvent(event) || !isLikelyKeyboardSelection(event)) {
      return;
    }

    markActiveSelectionStarted();
    keyboardSelectionInProgress = false;
    refreshSelectionPlayButtonFromCurrentSelection();
    scheduleSelectionCheck(committedSelectionDelayMs());
  }

  function scheduleCanceledSelectionCheck(event) {
    if (isSayThisOverlayEvent(event)) {
      return;
    }

    clearSelectionGestureInProgress();
    markActiveSelectionStarted();
    refreshSelectionPlayButtonFromCurrentSelection();
    scheduleSelectionCheck(committedSelectionDelayMs());
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

  function committedSelectionDelayMs() {
    return readSelectedText()
      ? COMMITTED_SELECTION_DEBOUNCE_MS
      : LATE_COMMITTED_SELECTION_DEBOUNCE_MS;
  }

  function resetSelectionTracking() {
    lastSentKey = "";
    lastSentAt = 0;
    lastSentSelectionStartedAt = 0;
    lastPreparedKey = "";
    lastPreparedAt = 0;
    lastPreparedSentAt = 0;
    lastPreparedTrace = null;
    selectionGestureStartedAt = 0;
    activeSelectionStartedAt = 0;
    clearSelectionGestureInProgress();
  }

  function markSelectionGestureStarted() {
    selectionGestureStartedAt = Date.now();
    activeSelectionStartedAt = 0;
  }

  function markActiveSelectionStarted() {
    if (!activeSelectionStartedAt) {
      activeSelectionStartedAt = selectionGestureStartedAt || Date.now();
    }
  }

  function isSelectionGestureInProgress() {
    return pointerSelectionInProgress || keyboardSelectionInProgress;
  }

  function clearSelectionGestureInProgress() {
    pointerSelectionInProgress = false;
    keyboardSelectionInProgress = false;
  }

  function primePlaybackSurface() {
    const now = Date.now();
    if (primePlaybackPromise || now - lastPrimeAt < PLAYBACK_PRIME_COOLDOWN_MS) {
      return;
    }

    primePlaybackPromise = (async () => {
      if (!selectionAssistAllowedByKnownSettings()) {
        return;
      }

      readSettings();
      lastPrimeAt = Date.now();
      sendRuntimeMessage({
        type: MESSAGE_TYPE_PREPARE_PLAYBACK,
        trace: createTrace("select-to-hear-prime")
      });
    })().finally(() => {
      primePlaybackPromise = null;
    });
  }

  async function speakStableSelection(options = {}) {
    const selectedText = readSelectedText();
    if (!selectedText) {
      resetSelectionTracking();
      return;
    }

    if (!isAutoPronounceCandidate(selectedText)) {
      return;
    }

    const key = lookupKey(selectedText);
    if (!key || (!options.force && isSuppressedRepeat(key))) {
      return;
    }

    if (!options.force && !selectToHearEnabledForAction()) {
      return;
    }

    selectionControls.hidePlayButton();
    lastSentKey = key;
    lastSentAt = Date.now();
    lastSentSelectionStartedAt = activeSelectionStartedAt;
    const preparedTrace = sentPreparedTraceForKey(key);
    const baseTrace = preparedTrace || pendingPreparedTraceForKey(key) || createTrace("select-to-hear", {
      trigger: options.trigger || "automatic"
    });
    const trace = options.trigger && baseTrace.trigger !== options.trigger
      ? {
        ...baseTrace,
        trigger: options.trigger
      }
      : baseTrace;
    selectionControls.showStatus(selectedText, "Loading");
    sendRuntimeMessage({
      type: MESSAGE_TYPE_SPEAK,
      text: selectedText,
      rate: 0.82,
      prepareSharedAudio: !preparedTrace,
      stopPreviousPlayback: true,
      trace
    }).then((response) => {
      if (!response?.ok) {
        lastSentKey = "";
        lastSentAt = 0;
        lastSentSelectionStartedAt = 0;
        selectionControls.showStatus(selectedText, timedStatusLabel("Unavailable", trace), { autoHide: true });
        return;
      }

      const status = response.speech?.fallback === "audio" ? "Playing" : "Speaking";
      selectionControls.showStatus(selectedText, timedStatusLabel(status, trace), {
        autoHide: true
      });
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
    lastPreparedSentAt = 0;
    lastPreparedTrace = trace;

    if (!selectionAssistEnabledForAction()) {
      if (lastPreparedTrace === trace) {
        lastPreparedKey = "";
        lastPreparedAt = 0;
        lastPreparedSentAt = 0;
        lastPreparedTrace = null;
      }
      return;
    }

    sendPrepareForSelection(selectedText, key, trace);
  }

  function isSuppressedRepeat(key) {
    if (key !== lastSentKey) {
      return false;
    }

    if (activeSelectionStartedAt && activeSelectionStartedAt === lastSentSelectionStartedAt) {
      return true;
    }

    return Date.now() - lastSentAt < REPEAT_SELECTION_COOLDOWN_MS;
  }

  function isSuppressedPrepare(key) {
    if (key !== lastPreparedKey) {
      return false;
    }

    return Date.now() - lastPreparedAt < REPEAT_SELECTION_COOLDOWN_MS;
  }

  function sentPreparedTraceForKey(key) {
    if (!lastPreparedSentAt) {
      return null;
    }

    return pendingPreparedTraceForKey(key);
  }

  function pendingPreparedTraceForKey(key) {
    if (key !== lastPreparedKey || !lastPreparedTrace) {
      return null;
    }

    if (Date.now() - lastPreparedAt > PREPARED_SELECTION_TTL_MS) {
      return null;
    }

    return lastPreparedTrace;
  }

  function sendPrepareForSelection(selectedText, key, trace) {
    if (!key || !trace) {
      return;
    }

    const now = Date.now();
    if (key !== lastPreparedKey || lastPreparedTrace?.id !== trace.id) {
      lastPreparedKey = key;
      lastPreparedTrace = trace;
    }
    lastPreparedAt = now;
    if (lastPreparedSentAt && now - lastPreparedSentAt < PREPARED_SELECTION_TTL_MS) {
      return;
    }

    lastPreparedSentAt = now;
    sendRuntimeMessage({
      type: MESSAGE_TYPE_PREPARE_PLAYBACK,
      text: selectedText,
      rate: 0.82,
      trace
    });
  }

  function readSelectedText() {
    const editableText = readEditableSelection();
    if (editableText) {
      return normalizeSelectedText(editableText);
    }

    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed || isSayThisOverlaySelection(selection)) {
      return "";
    }

    return normalizeSelectedText(selection.toString());
  }

  function readEditableSelection() {
    const element = document.activeElement;
    if (!isTextSelectionControl(element) || isSayThisOverlayNode(element)) {
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
    return nodes.some(isSayThisOverlayNode);
  }

  function isSayThisOverlayEvent(event = {}) {
    if (isSayThisOverlayNode(event.target)) {
      return true;
    }

    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return Array.isArray(path) && path.some(isSayThisOverlayNode);
  }

  function isSayThisOverlayNode(node) {
    if (!node || typeof node !== "object") {
      return false;
    }

    const tagName = String(node.tagName || "").toLowerCase();
    if (tagName === "saythis-overlay" ||
      tagName === "saythis-selection-status" ||
      tagName === "saythis-selection-play-button") {
      return true;
    }

    const root = node.getRootNode?.();
    const hostTagName = String(root?.host?.tagName || "").toLowerCase();
    return hostTagName === "saythis-overlay" ||
      hostTagName === "saythis-selection-status" ||
      hostTagName === "saythis-selection-play-button";
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

    if (words.length > 1 && /[.!?。！？]$/.test(text)) {
      return false;
    }

    return words.length <= MAX_ORDINARY_AUTO_WORDS || isLikelyNameSelection(words);
  }

  function isLikelyNameSelection(words = []) {
    return words.every((word) => {
      const normalized = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      const key = normalized.toLocaleLowerCase();
      return NAME_CONNECTOR_WORDS.has(key) ||
        /^[\p{Lu}\p{Lt}][\p{L}\p{M}'’.-]*$/u.test(normalized) ||
        /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Thai}]/u.test(normalized);
    });
  }

  function isLikelyKeyboardSelection(event = {}) {
    if (event.shiftKey) {
      const key = String(event.key || "").toLowerCase();
      return ["arrowleft", "arrowright", "arrowup", "arrowdown", "home", "end"].includes(key);
    }

    const key = String(event.key || "").toLowerCase();
    return key === "a" && (event.ctrlKey || event.metaKey);
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
      const stored = await runtimeAdapters.getStorage?.([SETTINGS_KEY]);
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

  function selectionPlayButtonEnabled(settings = {}) {
    return settings.selectionPlayButton === true;
  }

  function selectionAssistEnabled(settings = {}) {
    return selectToHearEnabled(settings) || selectionPlayButtonEnabled(settings);
  }

  function selectToHearAllowedByKnownSettings() {
    return !lastSettings || selectToHearEnabled(lastSettings);
  }

  function selectionAssistAllowedByKnownSettings() {
    return !lastSettings || selectionAssistEnabled(lastSettings);
  }

  function selectToHearEnabledForAction() {
    readSettings();
    return selectToHearAllowedByKnownSettings();
  }

  function selectionAssistEnabledForAction() {
    readSettings();
    return selectionAssistAllowedByKnownSettings();
  }

  function sendRuntimeMessage(message) {
    if (typeof runtimeAdapters.sendMessage !== "function") {
      return Promise.resolve({ ok: false });
    }

    try {
      const response = runtimeAdapters.sendMessage(message);
      return response && typeof response.then === "function"
        ? response.catch(() => ({ ok: false }))
        : Promise.resolve(response).catch(() => ({ ok: false }));
    } catch {
      return Promise.resolve({ ok: false });
    }
  }

  function refreshSelectionPlayButtonFromCurrentSelection() {
    refreshSelectionPlayButton(readSelectedText());
  }

  function refreshSelectionPlayButton(selectedText) {
    const text = normalizeSelection(selectedText);
    if (!text || !isAutoPronounceCandidate(text)) {
      selectionControls.hidePlayButton();
      return;
    }

    readSettings()
      .then((settings) => {
        if (normalizeSelection(readSelectedText()) !== text || !selectionPlayButtonEnabled(settings)) {
          selectionControls.hidePlayButton();
          return;
        }

        selectionControls.showPlayButton(text);
      })
      .catch(() => {
        selectionControls.hidePlayButton();
      });
  }

  function timedStatusLabel(label, trace = null) {
    const elapsed = selectionElapsedMs(trace);
    return Number.isFinite(elapsed)
      ? `${label} in ${elapsed} ms`
      : label;
  }

  function selectionElapsedMs(trace = null) {
    const startedAt = Number(trace?.startedAt);
    if (!Number.isFinite(startedAt) || startedAt <= 0) {
      return Number.NaN;
    }

    return Math.max(0, Math.round(Date.now() - startedAt));
  }

  function createTrace(action, details = {}) {
    const startedAt = action === "select-to-hear"
      ? activeSelectionStartedAt || selectionGestureStartedAt || Date.now()
      : Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return {
      id: `selection-${startedAt.toString(36)}-${random}`,
      source: "content-selection",
      action,
      ...details,
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

  function normalizeSelectedText(value) {
    return normalizeSelection(value)
      .replace(EDGE_SELECTED_TEXT_PUNCTUATION, "")
      .trim();
  }
})();
