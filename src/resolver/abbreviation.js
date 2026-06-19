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

  const compactAndGuide = compactAndInitialismGuide(text);
  if (compactAndGuide) {
    return compactAndGuide;
  }

  const connectorGuide = connectorInitialismGuide(text);
  if (connectorGuide) {
    return connectorGuide;
  }

  const letters = initialismLetters(text);
  return letters.length >= 2
    ? letters.join(" ")
    : "";
}

function compactAndInitialismGuide(text) {
  const match = text.match(/^([A-Za-z0-9])n([A-Za-z0-9])$/);
  return match
    ? `${match[1].toUpperCase()} and ${match[2].toUpperCase()}`
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

function connectorInitialismGuide(text) {
  if (!/[&+]/.test(text)) {
    return "";
  }

  const tokens = [];
  let chunk = "";

  for (const char of text) {
    if (char === "&" || char === "+") {
      if (chunk) {
        const chunkTokens = connectorChunkTokens(chunk);
        if (!chunkTokens.length) {
          return "";
        }
        tokens.push(...chunkTokens);
        chunk = "";
      }

      tokens.push(char === "&" ? "and" : "plus");
    } else {
      chunk += char;
    }
  }

  if (chunk) {
    const chunkTokens = connectorChunkTokens(chunk);
    if (!chunkTokens.length) {
      return "";
    }
    tokens.push(...chunkTokens);
  }

  const spokenTokens = tokens.filter((token) => token !== "and" && token !== "plus");
  return spokenTokens.length && tokens.length >= 2
    ? tokens.join(" ")
    : "";
}

function connectorChunkTokens(chunk) {
  const compact = chunk.replace(/[.\-_/]+/g, "");
  const letters = compact.match(/[A-Za-z]/g) || [];
  const digits = compact.match(/[0-9]/g) || [];
  if (!compact || letters.length + digits.length !== compact.length || letters.length + digits.length > 8) {
    return [];
  }

  if (letters.length + digits.length === 1) {
    return compact.split("").map((item) => item.toUpperCase());
  }

  return initialismLetters(compact);
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
