import {
  normalizeSelection
} from "./resolver-core.js";

export const MESSAGE_TYPES = Object.freeze({
  resolve: "SAYTHIS_RESOLVE",
  speak: "SAYTHIS_SPEAK",
  stop: "SAYTHIS_STOP",
  feedback: "SAYTHIS_FEEDBACK",
  flushSync: "SAYTHIS_FLUSH_SYNC",
  getDebugState: "SAYTHIS_GET_DEBUG_STATE",
  debugEvent: "SAYTHIS_DEBUG_EVENT",
  pullApproved: "SAYTHIS_PULL_APPROVED",
  requestSharedAudio: "SAYTHIS_REQUEST_SHARED_AUDIO",
  preparePlayback: "SAYTHIS_PREPARE_PLAYBACK",
  showResult: "SAYTHIS_SHOW_RESULT",
  getVisibleResult: "SAYTHIS_GET_VISIBLE_RESULT",
  playAudio: "SAYTHIS_PLAY_AUDIO",
  offscreenDebugState: "SAYTHIS_OFFSCREEN_DEBUG_STATE",
  offscreenPrepareAudio: "SAYTHIS_OFFSCREEN_PREPARE_AUDIO",
  offscreenPlayAudio: "SAYTHIS_OFFSCREEN_PLAY_AUDIO",
  offscreenSpeak: "SAYTHIS_OFFSCREEN_SPEAK",
  offscreenStopAudio: "SAYTHIS_OFFSCREEN_STOP_AUDIO"
});

const VALID_FEEDBACK_KINDS = new Set([
  "confirm",
  "wrong",
  "missing",
  "correction"
]);

export function createResolveMessage(text, options = {}) {
  return compactMessage({
    type: MESSAGE_TYPES.resolve,
    text: normalizeSelection(text),
    useOnline: normalizeOptionalBoolean(options, "useOnline"),
    languageHints: normalizeLanguageHints(options.languageHints)
  });
}

export function createSpeakMessage(text, options = {}) {
  return compactMessage({
    type: MESSAGE_TYPES.speak,
    text: normalizeSelection(text),
    result: options.result && typeof options.result === "object" ? options.result : undefined,
    rate: normalizeRate(options.rate),
    lang: normalizeLanguageOption(options.lang),
    useOnline: normalizeOptionalBoolean(options, "useOnline"),
    languageHints: normalizeLanguageHints(options.languageHints),
    skipSharedAudio: normalizeOptionalBoolean(options, "skipSharedAudio"),
    trace: normalizeTrace(options.trace)
  });
}

export function createStopMessage() {
  return { type: MESSAGE_TYPES.stop };
}

export function createFeedbackMessage(text, feedback = {}) {
  return compactMessage({
    type: MESSAGE_TYPES.feedback,
    text: normalizeSelection(text),
    feedback: normalizeFeedback(feedback)
  });
}

export function createFlushSyncMessage() {
  return { type: MESSAGE_TYPES.flushSync };
}

export function createPullApprovedMessage() {
  return { type: MESSAGE_TYPES.pullApproved };
}

export function createGetDebugStateMessage() {
  return { type: MESSAGE_TYPES.getDebugState };
}

export function createDebugEventMessage(kind, payload = {}) {
  return compactMessage({
    type: MESSAGE_TYPES.debugEvent,
    kind: normalizeDebugKind(kind),
    payload: normalizeDebugPayload(payload)
  });
}

export function createRequestSharedAudioMessage(text, options = {}) {
  return compactMessage({
    type: MESSAGE_TYPES.requestSharedAudio,
    text: normalizeSelection(text),
    result: options.result && typeof options.result === "object" ? options.result : undefined,
    rate: normalizeRate(options.rate),
    trace: normalizeTrace(options.trace)
  });
}

export function createPreparePlaybackMessage(options = {}) {
  return compactMessage({
    type: MESSAGE_TYPES.preparePlayback,
    text: normalizeSelection(options.text),
    rate: normalizeRate(options.rate),
    trace: normalizeTrace(options.trace)
  });
}

export function createShowResultMessage(result, options = {}) {
  return compactMessage({
    type: MESSAGE_TYPES.showResult,
    result: result && typeof result === "object" ? result : undefined,
    autoPlay: Boolean(options.autoPlay)
  });
}

export function createGetVisibleResultMessage() {
  return { type: MESSAGE_TYPES.getVisibleResult };
}

export function createPlayAudioMessage(audio, options = {}) {
  return compactMessage({
    type: MESSAGE_TYPES.playAudio,
    audio: audio && typeof audio === "object" ? audio : undefined,
    rate: normalizeRate(options.rate),
    trace: normalizeTrace(options.trace)
  });
}

export function createOffscreenPrepareAudioMessage(audio, options = {}) {
  return compactMessage({
    type: MESSAGE_TYPES.offscreenPrepareAudio,
    audio: audio && typeof audio === "object" ? audio : undefined,
    trace: normalizeTrace(options.trace)
  });
}

export function createOffscreenPlayAudioMessage(audio, playbackRate, options = {}) {
  return compactMessage({
    type: MESSAGE_TYPES.offscreenPlayAudio,
    audio: audio && typeof audio === "object" ? audio : undefined,
    playbackRate: normalizeRate(playbackRate),
    trace: normalizeTrace(options.trace)
  });
}

export function createOffscreenDebugStateMessage(options = {}) {
  return compactMessage({
    type: MESSAGE_TYPES.offscreenDebugState,
    lang: normalizeLanguageOption(options.lang)
  });
}

export function createOffscreenSpeakMessage(text, options = {}) {
  return compactMessage({
    type: MESSAGE_TYPES.offscreenSpeak,
    text: normalizeSelection(text),
    lang: normalizeLanguageOption(options.lang),
    rate: normalizeRate(options.rate),
    trace: normalizeTrace(options.trace)
  });
}

export function createOffscreenStopAudioMessage() {
  return { type: MESSAGE_TYPES.offscreenStopAudio };
}

function normalizeFeedback(feedback = {}) {
  const kind = VALID_FEEDBACK_KINDS.has(feedback.kind) ? feedback.kind : "";
  if (!kind) {
    return {};
  }

  return compactMessage({
    kind,
    sourceForm: normalizeSelection(feedback.sourceForm),
    aliases: normalizeAliases(feedback.aliases),
    language: normalizeLanguageOption(feedback.language),
    languageName: normalizeSelection(feedback.languageName),
    simple: normalizeSelection(feedback.simple),
    ipa: normalizeSelection(feedback.ipa),
    origin: normalizeSelection(feedback.origin),
    root: normalizeSelection(feedback.root),
    domainHint: normalizeSelection(feedback.domainHint),
    variants: normalizeAliases(feedback.variants),
    audioUrl: normalizeUrl(feedback.audioUrl),
    sourceUrl: normalizeUrl(feedback.sourceUrl),
    variantNote: normalizeSelection(feedback.variantNote)
  });
}

function normalizeLanguageOption(value) {
  return String(value || "")
    .trim()
    .replace(/_/g, "-")
    .slice(0, 32);
}

function normalizeLanguageHints(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(/[\s,;]+/);
  const seen = new Set();
  const hints = [];

  for (const item of values) {
    const code = normalizeLanguageOption(item)
      .toLowerCase()
      .match(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/)?.[0]
      ?.split("-")[0] || "";
    if (!code || seen.has(code)) {
      continue;
    }

    seen.add(code);
    hints.push(code);
    if (hints.length >= 8) {
      break;
    }
  }

  return hints;
}

function normalizeRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) ? Math.min(1.4, Math.max(0.45, rate)) : undefined;
}

function normalizeAliases(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\n]/);

  return [...new Set(raw.map(normalizeSelection).filter(Boolean))].slice(0, 12);
}

function normalizeOptionalBoolean(options, key) {
  if (!Object.prototype.hasOwnProperty.call(options, key) || options[key] === undefined) {
    return undefined;
  }

  return Boolean(options[key]);
}

function normalizeTrace(value = {}) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const id = normalizeSelection(value.id).slice(0, 80);
  const startedAt = Number(value.startedAt);
  if (!id || !Number.isFinite(startedAt)) {
    return undefined;
  }

  return compactMessage({
    id,
    source: normalizeSelection(value.source).slice(0, 32),
    action: normalizeSelection(value.action).slice(0, 48),
    startedAt
  });
}

function normalizeDebugKind(value) {
  return normalizeSelection(value)
    .replace(/[^\w:.-]+/g, "-")
    .slice(0, 80);
}

function normalizeDebugPayload(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value).slice(0, 24);
  return Object.fromEntries(entries.map(([key, item]) => [
    normalizeDebugKind(key),
    normalizeDebugValue(item)
  ]).filter(([key, item]) => key && item !== undefined));
}

function normalizeDebugValue(value) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : undefined;
  }

  if (typeof value === "string") {
    return normalizeLongText(value);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 12).map(normalizeDebugValue).filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    if (value.id && value.startedAt) {
      return normalizeTrace(value);
    }
    return normalizeDebugPayload(value);
  }

  return undefined;
}

function normalizeLongText(value) {
  return String(value || "").trim().slice(0, 2048);
}

function normalizeUrl(value) {
  const raw = normalizeLongText(value);
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    return ["https:", "chrome-extension:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function compactMessage(message) {
  return Object.fromEntries(
    Object.entries(message).filter(([, value]) => {
      if (value === undefined || value === null || value === "") {
        return false;
      }

      if (Array.isArray(value) && !value.length) {
        return false;
      }

      if (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) {
        return false;
      }

      return true;
    })
  );
}
