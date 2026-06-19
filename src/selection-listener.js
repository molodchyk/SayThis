(function installSayThisSelectionListener() {
  if (window.__sayThisSelectionListenerReady) {
    return;
  }
  window.__sayThisSelectionListenerReady = true;

  const MESSAGE_TYPE_SPEAK = "SAYTHIS_SPEAK";
  const MESSAGE_TYPE_DEBUG = "SAYTHIS_DEBUG_EVENT";
  const SETTINGS_KEY = "settings";
  const SELECTION_CHANGE_DEBOUNCE_MS = 160;
  const COMMITTED_SELECTION_DEBOUNCE_MS = 25;
  const REPEAT_SELECTION_COOLDOWN_MS = 1200;
  const MAX_AUTO_TEXT_LENGTH = 80;
  const MAX_AUTO_WORDS = 5;
  const chromeApi = globalThis.chrome;

  let timerId = null;
  let lastSentKey = "";
  let lastSentAt = 0;
  let lastSettings = null;

  readSettings();

  document.addEventListener("selectionchange", () => scheduleSelectionCheck(SELECTION_CHANGE_DEBOUNCE_MS), true);
  document.addEventListener("pointerup", () => scheduleSelectionCheck(COMMITTED_SELECTION_DEBOUNCE_MS), true);
  document.addEventListener("mouseup", () => scheduleSelectionCheck(COMMITTED_SELECTION_DEBOUNCE_MS), true);
  document.addEventListener("keyup", () => scheduleSelectionCheck(COMMITTED_SELECTION_DEBOUNCE_MS), true);
  document.addEventListener("touchend", () => scheduleSelectionCheck(COMMITTED_SELECTION_DEBOUNCE_MS), true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      clearScheduledCheck();
    }
  });

  chromeApi?.storage?.onChanged?.addListener?.((changes, areaName) => {
    if (areaName === "local" && Object.prototype.hasOwnProperty.call(changes, SETTINGS_KEY)) {
      lastSettings = changes[SETTINGS_KEY].newValue || null;
    }
  });

  function scheduleSelectionCheck(delayMs) {
    clearScheduledCheck();
    timerId = setTimeout(() => {
      timerId = null;
      speakStableSelection();
    }, delayMs);
  }

  function clearScheduledCheck() {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  async function speakStableSelection() {
    const selectedText = readSelectedText();
    if (!selectedText) {
      lastSentKey = "";
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
    const trace = createTrace("select-to-hear");
    sendRuntimeMessage({
      type: MESSAGE_TYPE_DEBUG,
      kind: "ui:selection-auto-speak",
      payload: {
        text: selectedText,
        trace
      }
    });
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

  function isSuppressedRepeat(key) {
    if (key !== lastSentKey) {
      return false;
    }

    return Date.now() - lastSentAt < REPEAT_SELECTION_COOLDOWN_MS;
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

    try {
      const stored = await chromeApi?.storage?.local?.get?.([SETTINGS_KEY]);
      lastSettings = stored?.[SETTINGS_KEY] || {};
      return lastSettings;
    } catch {
      return {};
    }
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
