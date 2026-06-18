import {
  normalizeSelection
} from "../resolver/text.js";

export function commonsPronunciationAudioItem(fileName, options = {}) {
  const linguaLibre = isLinguaLibreAudioFile(fileName);
  const label = normalizeSelection(options.label || "Pronunciation audio");
  const source = normalizeSelection(options.source || "Wikimedia Commons");

  return {
    url: normalizeSelection(options.url || commonsRedirectUrl(fileName)),
    label: linguaLibre ? linguaLibreAudioLabel(label) : label,
    source: linguaLibre ? linguaLibreAudioSource(source) : source,
    quality: linguaLibre ? "native-speaker" : normalizeSelection(options.quality || "verified")
  };
}

export function commonsRedirectUrl(fileName) {
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(normalizeSelection(fileName))}`;
}

export function isLinguaLibreAudioFile(fileName) {
  return /^LL[-_]/i.test(normalizeCommonsFileName(fileName));
}

function linguaLibreAudioLabel(label) {
  return normalizeSelection(label).replace(/^(?:Pronunciation|Wikimedia Commons) audio/i, "Lingua Libre audio") || "Lingua Libre audio";
}

function linguaLibreAudioSource(source) {
  const label = normalizeSelection(source);
  if (!label) {
    return "Wikimedia Commons (Lingua Libre)";
  }

  if (/lingua libre/i.test(label)) {
    return label;
  }

  return `${label} (Lingua Libre)`;
}

function normalizeCommonsFileName(fileName) {
  return normalizeSelection(fileName).replace(/^File:/i, "");
}
