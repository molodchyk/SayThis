import {
  detectScript
} from "../resolver/text.js";

const SCRIPT_SEARCH_LANGUAGES = {
  Arabic: ["ar", "fa"],
  Armenian: ["hy"],
  Cyrillic: ["ru", "bg", "sr"],
  Devanagari: ["hi", "mr", "ne"],
  Greek: ["el"],
  Han: ["zh", "ja", "ko"],
  Hangul: ["ko"],
  Hebrew: ["he"],
  Hiragana: ["ja"],
  Katakana: ["ja"],
  Thai: ["th"]
};

export function wikidataSearchLanguages(query, options = {}) {
  const script = detectScript(query).script;
  const hints = normalizeSearchLanguageHints(
    Array.isArray(options) ? options : options.languageHints
  );
  return [...new Set(["en", ...(SCRIPT_SEARCH_LANGUAGES[script] || []), ...hints])].slice(0, 8);
}

export function normalizeSearchLanguageHints(value = []) {
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(/[\s,;]+/);
  const seen = new Set();
  const hints = [];

  for (const item of values) {
    const code = normalizeSearchLanguageCode(item);
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

function normalizeSearchLanguageCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .match(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/)?.[0]
    ?.split("-")[0] || "";
}
