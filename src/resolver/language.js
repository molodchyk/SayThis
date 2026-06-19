const LANGUAGE_TO_TTS = {
  ar: "ar",
  bg: "bg-BG",
  cs: "cs-CZ",
  da: "da-DK",
  de: "de-DE",
  el: "el-GR",
  en: "en-US",
  es: "es-ES",
  fa: "fa-IR",
  fi: "fi-FI",
  fr: "fr-FR",
  ga: "ga-IE",
  he: "he-IL",
  hi: "hi-IN",
  hr: "hr-HR",
  hu: "hu-HU",
  hy: "hy-AM",
  id: "id-ID",
  it: "it-IT",
  ja: "ja-JP",
  ko: "ko-KR",
  la: "la",
  mr: "mr-IN",
  ms: "ms-MY",
  ne: "ne-NP",
  nl: "nl-NL",
  no: "nb-NO",
  pl: "pl-PL",
  pt: "pt-PT",
  ro: "ro-RO",
  ru: "ru-RU",
  sr: "sr-RS",
  sv: "sv-SE",
  th: "th-TH",
  tr: "tr-TR",
  uk: "uk-UA",
  vi: "vi-VN",
  zh: "zh-CN"
};

const SCRIPT_HINTS = {
  Arabic: { languageName: "Arabic-script term" },
  Armenian: { language: "hy", languageName: "Armenian", ttsLang: "hy-AM" },
  Cyrillic: { languageName: "Cyrillic-script term" },
  Devanagari: { languageName: "Devanagari-script term" },
  Greek: { language: "el", languageName: "Greek", ttsLang: "el-GR" },
  Han: { languageName: "CJK ideographic term" },
  Hangul: { language: "ko", languageName: "Korean", ttsLang: "ko-KR" },
  Hebrew: { language: "he", languageName: "Hebrew", ttsLang: "he-IL" },
  Hiragana: { language: "ja", languageName: "Japanese", ttsLang: "ja-JP" },
  Katakana: { language: "ja", languageName: "Japanese", ttsLang: "ja-JP" },
  Thai: { language: "th", languageName: "Thai", ttsLang: "th-TH" }
};

const LANGUAGE_NAMES = {
  ar: "Arabic",
  bg: "Bulgarian",
  cs: "Czech",
  da: "Danish",
  de: "German",
  el: "Greek",
  en: "English",
  es: "Spanish",
  fa: "Persian",
  fi: "Finnish",
  fr: "French",
  ga: "Irish",
  he: "Hebrew",
  hi: "Hindi",
  hr: "Croatian",
  hu: "Hungarian",
  hy: "Armenian",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  la: "Latin",
  mr: "Marathi",
  ms: "Malay",
  ne: "Nepali",
  nl: "Dutch",
  no: "Norwegian",
  pl: "Polish",
  pt: "Portuguese",
  ro: "Romanian",
  ru: "Russian",
  sr: "Serbian",
  sv: "Swedish",
  th: "Thai",
  tr: "Turkish",
  vi: "Vietnamese",
  zh: "Chinese"
};

let languageDisplayNames;

export function scriptHintForScript(script) {
  return SCRIPT_HINTS[script] || {};
}

export function ttsLangFromLanguage(language) {
  const normalized = languageCodeFromLanguage(language);
  if (!normalized) {
    return "";
  }

  if (normalized.includes("-")) {
    return normalized;
  }

  return LANGUAGE_TO_TTS[normalized] || normalized;
}

export function languageCodeFromLanguage(language) {
  const raw = String(language || "").trim();
  if (!raw) {
    return "";
  }

  const code = normalizeLanguageCode(raw);
  if (code) {
    return code;
  }

  const key = normalizeLanguageName(raw);
  if (!key) {
    return "";
  }

  return languageCodeByName().get(key) || "";
}

export function languageNameFromCode(language) {
  const code = languageCodeFromLanguage(language) || String(language || "").trim().replace(/_/g, "-").toLowerCase();
  const baseCode = code.split("-")[0];

  return LANGUAGE_NAMES[code] ||
    (code.includes("-") ? displayLanguageName(code) : "") ||
    LANGUAGE_NAMES[baseCode] ||
    displayLanguageName(code);
}

function displayLanguageName(language) {
  if (!language || typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") {
    return "";
  }

  try {
    const [canonical] = Intl.getCanonicalLocales(language);
    if (!canonical) {
      return "";
    }

    languageDisplayNames ||= new Intl.DisplayNames(["en"], { type: "language" });
    return languageDisplayNames.of(canonical) || "";
  } catch {
    return "";
  }
}

let languageCodeByNameCache;

function languageCodeByName() {
  if (languageCodeByNameCache) {
    return languageCodeByNameCache;
  }

  const entries = new Map();
  for (const code of Object.keys(LANGUAGE_TO_TTS)) {
    addLanguageName(entries, code, LANGUAGE_NAMES[code]);
    addLanguageName(entries, code, displayLanguageName(code));
  }
  for (const locale of Object.values(LANGUAGE_TO_TTS)) {
    addLanguageName(entries, locale, displayLanguageName(locale));
  }

  languageCodeByNameCache = entries;
  return entries;
}

function addLanguageName(entries, code, name) {
  const normalizedCode = normalizeLanguageCode(code);
  const key = normalizeLanguageName(name);
  if (normalizedCode && key && !entries.has(key)) {
    entries.set(key, normalizedCode);
  }
}

function normalizeLanguageCode(value) {
  const raw = String(value || "")
    .trim()
    .replace(/_/g, "-");
  const match = raw.match(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/i)?.[0] || "";
  if (!match) {
    return "";
  }

  const [base, region] = match.split("-");
  return [
    base.toLowerCase(),
    region ? region.toUpperCase() : ""
  ].filter(Boolean).join("-");
}

function normalizeLanguageName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
