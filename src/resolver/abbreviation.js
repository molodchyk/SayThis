import {
  normalizeSelection
} from "./text.js";

const COMPACT_SEPARATORS = /[.\-_/&+\s]+/g;
const VOWELS = /[AEIOU]/;

export function initialismGuide(value) {
  const text = compactInitialismSeparators(normalizeSelection(value));
  if (!text || text.length > 32 || /\s/.test(text.trim())) {
    return "";
  }

  const letters = initialismLetters(text);
  return letters.length >= 2
    ? letters.join(" ")
    : "";
}

function compactInitialismSeparators(text) {
  return text.replace(/\s*([.\-_/&+])\s*/g, "$1");
}

function initialismLetters(text) {
  if (isDottedInitialism(text)) {
    return text.match(/[A-Za-z0-9]/g).map((item) => item.toUpperCase());
  }

  const compact = text.replace(COMPACT_SEPARATORS, "");
  const letters = compact.match(/[A-Za-z]/g) || [];
  const digits = compact.match(/[0-9]/g) || [];
  if (letters.length < 2 || letters.length + digits.length !== compact.length || letters.length + digits.length > 8) {
    return [];
  }

  if (isAllUpperToken(compact) && shouldSpellAllUpper(compact)) {
    return compact.split("").map((item) => item.toUpperCase());
  }

  if (isMixedInitialism(compact)) {
    return compact.split("").map((item) => item.toUpperCase());
  }

  if (isTechnicalMixedInitialism(compact)) {
    return compact.split("").map((item) => item.toUpperCase());
  }

  return [];
}

function isDottedInitialism(text) {
  return /^(?:[A-Za-z0-9]\.){2,}[A-Za-z0-9]?\.?$/.test(text);
}

function isAllUpperToken(text) {
  return /^[A-Z0-9]+$/.test(text) && /[A-Z]/.test(text);
}

function shouldSpellAllUpper(text) {
  const letters = text.replace(/[0-9]/g, "");
  if (letters.length <= 3) {
    return true;
  }

  return !VOWELS.test(letters);
}

function isMixedInitialism(text) {
  return /^[A-Z][a-z]{1,2}[A-Z]$/.test(text);
}

function isTechnicalMixedInitialism(text) {
  return text === "pH" || /^[a-z]{1,2}[A-Z]{2,6}$/.test(text);
}
