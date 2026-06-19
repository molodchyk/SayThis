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
  pullApproved: "SAYTHIS_PULL_APPROVED",
  requestSharedAudio: "SAYTHIS_REQUEST_SHARED_AUDIO",
  showResult: "SAYTHIS_SHOW_RESULT",
  playAudio: "SAYTHIS_PLAY_AUDIO",
  offscreenDebugState: "SAYTHIS_OFFSCREEN_DEBUG_STATE",
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
    skipSharedAudio: normalizeOptionalBoolean(options, "skipSharedAudio")
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

export function createRequestSharedAudioMessage(text, options = {}) {
  return compactMessage({
    type: MESSAGE_TYPES.requestSharedAudio,
    text: normalizeSelection(text),
    result: options.result && typeof options.result === "object" ? options.result : undefined,
    rate: normalizeRate(options.rate)
  });
}

export function createShowResultMessage(result, options = {}) {
  return compactMessage({
    type: MESSAGE_TYPES.showResult,
    result: result && typeof result === "object" ? result : undefined,
    autoPlay: Boolean(options.autoPlay)
  });
}

export function createPlayAudioMessage(audio, options = {}) {
  return compactMessage({
    type: MESSAGE_TYPES.playAudio,
    audio: audio && typeof audio === "object" ? audio : undefined,
    rate: normalizeRate(options.rate)
  });
}

export function createOffscreenPlayAudioMessage(audio, playbackRate) {
  return compactMessage({
    type: MESSAGE_TYPES.offscreenPlayAudio,
    audio: audio && typeof audio === "object" ? audio : undefined,
    playbackRate: normalizeRate(playbackRate)
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
    rate: normalizeRate(options.rate)
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
