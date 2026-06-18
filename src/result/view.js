import {
  normalizeSelection,
  rankedAudioItems
} from "../resolver-core.js";
import {
  normalizeSpeakableGuide
} from "../resolver/pronunciation-guide.js";

export function evidenceItemsForResult(result, limit = 6) {
  const community = result?.community || {};
  const seen = new Set();
  return [
    ...trustSignalItems(result?.trustSignals),
    ...(Array.isArray(result?.evidence) ? result.evidence : []),
    result?.root ? `Root: ${result.root}` : "",
    result?.domainHint ? `Domain: ${result.domainHint}` : "",
    ...variantItems(result?.variants),
    result?.notes || result?.variantNote || "",
    community.confirmations ? `${community.confirmations} local confirmation${community.confirmations === 1 ? "" : "s"}` : "",
    community.corrections ? `${community.corrections} local correction${community.corrections === 1 ? "" : "s"}` : "",
    community.requests ? `${community.requests} local request${community.requests === 1 ? "" : "s"}` : "",
    community.flags ? `${community.flags} local wrong-result flag${community.flags === 1 ? "" : "s"}` : ""
  ]
    .map(normalizeSelection)
    .filter((item) => {
      if (!item || seen.has(item)) {
        return false;
      }

      seen.add(item);
      return true;
    })
    .slice(0, limit);
}

function trustSignalItems(value) {
  return normalizeTrustSignals(value)
    .map((item) => `Trust: ${item}`);
}

function variantItems(value) {
  return normalizeTrustSignals(value)
    .map((item) => `Variant: ${item}`);
}

export function sourceItemsForResult(result, limit = 4) {
  const sourceItems = Array.isArray(result?.sources) ? result.sources : [];

  return uniqueSourceItems([...sourceItems, ...audioItemsForResult(result, limit)])
    .slice(0, limit);
}

export function audioItemsForResult(result, limit = 4) {
  const items = Array.isArray(result?.pronunciation?.audio) ? result.pronunciation.audio : [];
  return uniqueAudioItems(items).slice(0, limit);
}

export function playbackItemsForResult(result, limit = 4) {
  const audio = audioItemsForResult(result, limit)
    .map((item) => ({ ...item, kind: "audio" }));
  const speech = sourceSpeechItemForResult(result);
  const guide = normalizeSpeakableGuide(result?.pronunciation?.simple);

  if (audio.length) {
    return audio;
  }

  return [
    speech,
    guide ? {
    kind: "guide",
    label: "Guide speech",
    text: guide
    } : null
  ].filter(Boolean).slice(0, limit);
}

export function playbackStatusForItem(item = {}, rate = 0.82) {
  if (item.kind === "audio" && isGeneratedAudioItem(item)) {
    return rate < 0.7 ? "Playing generated audio slowly." : "Playing generated audio.";
  }

  if (item.kind === "audio") {
    return rate < 0.7 ? "Playing recording slowly." : "Playing recording.";
  }

  if (item.kind === "guide") {
    return rate < 0.7 ? "Speaking guide slowly." : "Speaking guide.";
  }

  return rate < 0.7 ? "Speaking slowly." : "Speaking.";
}

export function preferredSpeechResultForResult(result) {
  const items = playbackItemsForResult(result);
  const item = items.find((candidate) => candidate.kind === "speech")
    || items.find((candidate) => candidate.kind === "guide");
  return speechResultForPlaybackItem(result, item);
}

export function speechResultForPlaybackItem(result, item = {}) {
  const text = normalizeSelection(item.text);
  if (!result || item?.kind === "audio" || !text) {
    return result;
  }

  if (item.kind === "guide") {
    return {
      ...result,
      speakText: text,
      ttsLang: "en-US",
      pronunciation: {
        ...(result.pronunciation || {}),
        simple: text
      }
    };
  }

  if (item.kind === "speech") {
    return {
      ...result,
      sourceForm: text,
      speakText: text,
      ttsLang: normalizeSelection(item.lang || result.ttsLang || result.language)
    };
  }

  return result;
}

export function alternateItemsForResult(result, limit = 3) {
  const alternates = Array.isArray(result?.alternateResults) ? result.alternateResults : [];
  return alternates
    .map((item, index) => normalizeAlternateItem(item, index))
    .filter((item) => item.sourceForm || item.display)
    .slice(0, limit);
}

function uniqueSourceItems(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const source = normalizeSourceItem(item);
    if (!source.url || seen.has(source.url)) {
      continue;
    }

    seen.add(source.url);
    result.push(source);
  }

  return result;
}

function uniqueAudioItems(items) {
  const seen = new Set();
  const result = [];

  for (const item of rankedAudioItems(items)) {
    const audio = normalizeAudioItem(item);
    if (!audio.url || seen.has(audio.url)) {
      continue;
    }

    seen.add(audio.url);
    result.push(audio);
  }

  return result;
}

function normalizeAlternateItem(item = {}, index = 0) {
  const sourceForm = normalizeSelection(item.sourceForm || item.display || item.query);
  const language = normalizeSelection(item.languageName || item.language);
  const source = normalizeSelection(item.sourceLabel || item.sourceStatus || item.confidence);
  const guide = normalizeSelection(item.pronunciation?.simple || item.pronunciation?.ipa);

  return {
    index,
    display: normalizeSelection(item.display || sourceForm),
    sourceForm,
    language,
    source,
    guide,
    summary: [
      sourceForm,
      language,
      source,
      guide
    ].filter(Boolean).join(" · ")
  };
}

function normalizeAudioItem(item = {}) {
  const url = normalizeUrl(item.url);
  const source = normalizeSelection(item.source);
  const quality = normalizeSelection(item.quality);
  return {
    label: audioItemLabel(item.label, source, quality, url),
    source,
    quality,
    url
  };
}

function audioItemLabel(label, source, quality, url) {
  const fallback = normalizeSelection(label || source || hostLabel(url) || "Pronunciation audio");
  if (!isGeneratedAudioQuality(quality)) {
    return fallback;
  }

  return /\bgenerated\b|\bshared audio\b/i.test(fallback)
    ? fallback
    : `Generated fallback: ${fallback}`;
}

function isGeneratedAudioItem(item = {}) {
  return isGeneratedAudioQuality(item.quality);
}

function isGeneratedAudioQuality(value) {
  return normalizeSelection(value).toLowerCase() === "generated";
}

function sourceSpeechItemForResult(result = {}) {
  const sourceForm = normalizeSelection(result.sourceForm || result.display || result.query);
  const lang = normalizeSelection(result.ttsLang || result.language);
  const selected = normalizeSelection(result.query || result.display);

  if (!sourceForm || !lang || baseLanguage(lang) === "en") {
    return null;
  }

  return {
    kind: "speech",
    label: selected && sourceForm !== selected ? "Source-form speech" : "Resolved speech",
    text: sourceForm,
    lang
  };
}

function baseLanguage(value) {
  return String(value || "").trim().toLowerCase().split(/[-_]/)[0];
}

function normalizeSourceItem(item = {}) {
  const url = normalizeUrl(item.url);
  return {
    label: normalizeSelection(item.label || item.source || hostLabel(url) || "Source"),
    url
  };
}

function normalizeTrustSignals(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\n]/);

  return [...new Set(raw.map(normalizeSelection).filter(Boolean))].slice(0, 12);
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    if (["https:", "chrome-extension:"].includes(url.protocol)) {
      return url.toString();
    }
  } catch {
    return "";
  }

  return "";
}

function hostLabel(url) {
  if (!url) {
    return "";
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
