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
  ga: "en-IE",
  he: "he-IL",
  hi: "hi-IN",
  hr: "hr-HR",
  hu: "hu-HU",
  hy: "hy-AM",
  id: "id-ID",
  it: "it-IT",
  ja: "ja-JP",
  ko: "ko-KR",
  la: "it-IT",
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
  vi: "vi-VN",
  zh: "zh-CN"
};

const SCRIPT_HINTS = {
  Arabic: { language: "ar", languageName: "Arabic", ttsLang: "ar" },
  Armenian: { language: "hy", languageName: "Armenian", ttsLang: "hy-AM" },
  Cyrillic: { language: "ru", languageName: "Cyrillic-script term", ttsLang: "ru-RU" },
  Devanagari: { language: "hi", languageName: "Devanagari-script term", ttsLang: "hi-IN" },
  Greek: { language: "el", languageName: "Greek", ttsLang: "el-GR" },
  Han: { language: "zh", languageName: "CJK ideographic term", ttsLang: "zh-CN" },
  Hangul: { language: "ko", languageName: "Korean", ttsLang: "ko-KR" },
  Hebrew: { language: "he", languageName: "Hebrew", ttsLang: "he-IL" },
  Hiragana: { language: "ja", languageName: "Japanese", ttsLang: "ja-JP" },
  Katakana: { language: "ja", languageName: "Japanese", ttsLang: "ja-JP" },
  Thai: { language: "th", languageName: "Thai", ttsLang: "th-TH" }
};

const LANGUAGE_NAMES = {
  ar: "Arabic",
  de: "German",
  el: "Greek",
  en: "English",
  es: "Spanish",
  fa: "Persian",
  fr: "French",
  ga: "Irish",
  he: "Hebrew",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  la: "Latin",
  pl: "Polish",
  pt: "Portuguese",
  ru: "Russian",
  vi: "Vietnamese",
  zh: "Chinese"
};

let languageDisplayNames;

export function scriptHintForScript(script) {
  return SCRIPT_HINTS[script] || {};
}

export function ttsLangFromLanguage(language) {
  if (!language) {
    return "";
  }

  if (language.includes("-")) {
    return language;
  }

  return LANGUAGE_TO_TTS[language] || language;
}

export function languageNameFromCode(language) {
  const code = String(language || "").trim().replace(/_/g, "-").toLowerCase();
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
