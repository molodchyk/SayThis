import {
  normalizeSelection
} from "./resolver-core.js";

export function evidenceItemsForResult(result, limit = 6) {
  const community = result?.community || {};
  return [
    ...trustSignalItems(result?.trustSignals),
    ...(Array.isArray(result?.evidence) ? result.evidence : []),
    result?.notes || "",
    community.confirmations ? `${community.confirmations} local confirmation${community.confirmations === 1 ? "" : "s"}` : "",
    community.corrections ? `${community.corrections} local correction${community.corrections === 1 ? "" : "s"}` : "",
    community.requests ? `${community.requests} local request${community.requests === 1 ? "" : "s"}` : "",
    community.flags ? `${community.flags} local wrong-result flag${community.flags === 1 ? "" : "s"}` : ""
  ]
    .map(normalizeSelection)
    .filter(Boolean)
    .slice(0, limit);
}

function trustSignalItems(value) {
  return normalizeTrustSignals(value)
    .map((item) => `Trust: ${item}`);
}

export function sourceItemsForResult(result, limit = 4) {
  const sourceItems = Array.isArray(result?.sources) ? result.sources : [];
  const audioItems = Array.isArray(result?.pronunciation?.audio)
    ? result.pronunciation.audio.map((item) => ({
      label: item.label || item.source || "Pronunciation audio",
      url: item.url
    }))
    : [];

  return uniqueSourceItems([...sourceItems, ...audioItems])
    .slice(0, limit);
}

export function alternateItemsForResult(result, limit = 3) {
  const alternates = Array.isArray(result?.alternateResults) ? result.alternateResults : [];
  return alternates
    .map(normalizeAlternateItem)
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

function normalizeAlternateItem(item = {}) {
  const sourceForm = normalizeSelection(item.sourceForm || item.display || item.query);
  const language = normalizeSelection(item.languageName || item.language);
  const source = normalizeSelection(item.sourceLabel || item.sourceStatus || item.confidence);
  const guide = normalizeSelection(item.pronunciation?.simple || item.pronunciation?.ipa);

  return {
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
