import {
  getBestAudio,
  normalizeSelection
} from "./resolver-core.js";

export function correctionValuesFromResult(result = {}) {
  const bestAudio = getBestAudio(result);
  const sourceUrl = firstSourceUrl(result);
  return {
    sourceForm: normalizeSelection(result.sourceForm),
    aliases: aliasesTextFromResult(result),
    language: normalizeSelection(result.language),
    languageName: normalizeSelection(result.languageName),
    simple: normalizeSelection(result.pronunciation?.simple),
    ipa: normalizeSelection(result.pronunciation?.ipa),
    origin: normalizeSelection(result.origin),
    root: normalizeSelection(result.root),
    domainHint: normalizeSelection(result.domainHint),
    variants: variantsTextFromResult(result),
    audioUrl: normalizeUrl(bestAudio?.url),
    sourceUrl,
    variantNote: normalizeSelection(result.notes || result.variantNote)
  };
}

export function correctionFeedbackFromValues(values = {}) {
  return {
    kind: "correction",
    sourceForm: normalizeSelection(values.sourceForm),
    aliases: normalizeAliases(values.aliases),
    language: normalizeSelection(values.language),
    languageName: normalizeSelection(values.languageName),
    simple: normalizeSelection(values.simple),
    ipa: normalizeSelection(values.ipa),
    origin: normalizeSelection(values.origin),
    root: normalizeSelection(values.root),
    domainHint: normalizeSelection(values.domainHint),
    variants: normalizeAliases(values.variants),
    audioUrl: normalizeUrl(values.audioUrl),
    sourceUrl: normalizeUrl(values.sourceUrl),
    variantNote: normalizeSelection(values.variantNote)
  };
}

export function hasCorrectionDetail(feedback = {}) {
  return ["sourceForm", "language", "languageName", "origin", "root", "domainHint", "ipa", "simple", "audioUrl", "sourceUrl", "variantNote"]
    .some((field) => Boolean(feedback[field])) ||
    Boolean(normalizeAliases(feedback.aliases).length) ||
    Boolean(normalizeAliases(feedback.variants).length);
}

function firstSourceUrl(result = {}) {
  const sources = Array.isArray(result.sources) ? result.sources : [];
  const source = sources.find((item) => normalizeUrl(item?.url));
  return normalizeUrl(source?.url);
}

function aliasesTextFromResult(result = {}) {
  const aliases = normalizeAliases(result.aliases);
  const query = normalizeSelection(result.query);
  const sourceForm = normalizeSelection(result.sourceForm || result.display);
  if (query && sourceForm && query.toLocaleLowerCase() !== sourceForm.toLocaleLowerCase()) {
    aliases.unshift(query);
  }

  return [...new Set(aliases)].join("; ");
}

function variantsTextFromResult(result = {}) {
  return normalizeAliases(result.variants).join("; ");
}

function normalizeAliases(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\n]/);

  return [...new Set(raw.map(normalizeSelection).filter(Boolean))].slice(0, 12);
}

function normalizeLongValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2048);
}

function normalizeUrl(value) {
  const raw = normalizeLongValue(value);
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
