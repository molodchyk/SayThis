import {
  normalizeApprovedEntries
} from "../../community-sync.js";
import {
  normalizeSelection,
  sourceLabelForStatus
} from "../../resolver-core.js";

export function resultWithSharedAudioEntry(result = {}, entry = {}) {
  const normalized = Object.values(normalizeApprovedEntries({ entries: [entry] }))[0];
  if (!normalized?.audioUrl) {
    return result;
  }

  const generated = normalizeSelection(normalized.sourceStatus) === "generated-audio" ||
    normalizeList(normalized.trustSignals).includes("generated-audio");
  const trustSignals = normalizeList(normalized.trustSignals);
  const sourceStatus = generated ? "generated-audio" : "verified-audio";
  const audioItem = {
    url: normalized.audioUrl,
    label: generated ? "Generated shared audio" : "Shared pronunciation audio",
    source: "SayThis shared audio",
    quality: sharedAudioQuality(generated, trustSignals)
  };
  const existingAudio = Array.isArray(result?.pronunciation?.audio)
    ? result.pronunciation.audio
    : [];
  const audio = prependUniqueAudio(audioItem, existingAudio);
  const evidence = uniqueTextItems([
    ...(Array.isArray(result?.evidence) ? result.evidence : []),
    generated ? "Shared generated audio" : "Shared pronunciation audio"
  ]);
  const mergedTrustSignals = uniqueTextItems([
    ...(Array.isArray(result?.trustSignals) ? result.trustSignals : []),
    ...trustSignals,
    generated ? "generated-audio" : "audio-backed"
  ]);
  const sources = appendSharedAudioSource(result?.sources, normalized.sourceUrl);

  return {
    ...result,
    sourceStatus,
    sourceLabel: sourceLabelForStatus(sourceStatus),
    pronunciation: {
      ...(result?.pronunciation || {}),
      audio
    },
    evidence,
    trustSignals: mergedTrustSignals,
    sources
  };
}

function sharedAudioQuality(generated, trustSignals = []) {
  if (generated) {
    return "generated";
  }

  const signals = new Set(trustSignals.map((item) => normalizeSelection(item).toLowerCase()));
  if (signals.has("native") || signals.has("native-speaker") || signals.has("native speaker")) {
    return "native-speaker";
  }

  if (signals.has("curated") || signals.has("curator-reviewed")) {
    return "curated";
  }

  if (signals.has("source-backed") || signals.has("moderator-reviewed")) {
    return "source-backed";
  }

  return "verified";
}

function prependUniqueAudio(first, rest = []) {
  const seen = new Set();
  const audio = [];
  for (const item of [first, ...rest]) {
    const url = normalizeLongText(item?.url);
    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    audio.push(item);
  }

  return audio;
}

function uniqueTextItems(values = []) {
  const seen = new Set();
  const items = [];
  for (const value of values) {
    const item = normalizeSelection(value);
    if (!item || seen.has(item)) {
      continue;
    }

    seen.add(item);
    items.push(item);
  }

  return items;
}

function appendSharedAudioSource(sources = [], sourceUrl = "") {
  const existing = Array.isArray(sources) ? sources : [];
  const url = normalizeLongText(sourceUrl);
  if (!url || existing.some((item) => normalizeLongText(item?.url) === url)) {
    return existing;
  }

  return [...existing, {
    label: "Shared audio source",
    url
  }];
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeSelection).filter(Boolean);
  }

  return String(value || "")
    .split(/[;,\n]/)
    .map(normalizeSelection)
    .filter(Boolean);
}

function normalizeLongText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2048);
}
