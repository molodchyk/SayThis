(function installSayThisOverlayLanguage() {
  if (globalThis.__sayThisOverlayLanguage) {
    return;
  }

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

  let displayNames;
  let codeByName;

  function normalizeTtsLanguage(ttsLang, language = "") {
    return ttsLangFromLanguage(ttsLang) || ttsLangFromLanguage(language);
  }

  function ttsLangFromLanguage(language) {
    const code = languageCodeFromLanguage(language);
    if (!code) {
      return "";
    }

    return code.includes("-") ? code : LANGUAGE_TO_TTS[code] || code;
  }

  function languageCodeFromLanguage(language) {
    const raw = String(language || "").trim();
    if (!raw) {
      return "";
    }

    const code = normalizeLanguageCode(raw);
    if (code) {
      return code;
    }

    return languageCodeByName().get(normalizeLanguageName(raw)) || "";
  }

  function languageCodeByName() {
    if (codeByName) {
      return codeByName;
    }

    const entries = new Map();
    for (const code of Object.keys(LANGUAGE_TO_TTS)) {
      addLanguageName(entries, code, LANGUAGE_NAMES[code]);
      addLanguageName(entries, code, displayLanguageName(code));
    }
    for (const locale of Object.values(LANGUAGE_TO_TTS)) {
      addLanguageName(entries, locale, displayLanguageName(locale));
    }

    codeByName = entries;
    return entries;
  }

  function addLanguageName(entries, code, name) {
    const normalizedCode = normalizeLanguageCode(code);
    const key = normalizeLanguageName(name);
    if (normalizedCode && key && !entries.has(key)) {
      entries.set(key, normalizedCode);
    }
  }

  function displayLanguageName(language) {
    if (!language || typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") {
      return "";
    }

    try {
      const [canonical] = Intl.getCanonicalLocales(language);
      displayNames ||= new Intl.DisplayNames(["en"], { type: "language" });
      return canonical ? displayNames.of(canonical) || "" : "";
    } catch {
      return "";
    }
  }

  function normalizeLanguageCode(value) {
    const raw = String(value || "").trim().replace(/_/g, "-");
    const match = raw.match(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/i)?.[0] || "";
    if (!match) {
      return "";
    }

    const [base, region] = match.split("-");
    return [base.toLowerCase(), region ? region.toUpperCase() : ""].filter(Boolean).join("-");
  }

  function normalizeLanguageName(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  globalThis.__sayThisOverlayLanguage = {
    languageCodeFromLanguage,
    normalizeTtsLanguage,
    ttsLangFromLanguage
  };
})();
