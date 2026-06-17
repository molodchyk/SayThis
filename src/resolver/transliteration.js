import {
  detectScript,
  normalizeSelection
} from "./text.js";

const CYRILLIC_HINT_LANGUAGES = new Set(["ru", "bg", "sr", "uk"]);
const STRONG_CYRILLIC_PATTERN = /(shch|zh|kh|ts|ch|sh|yu|ya|yo|ye)/i;
const CYRILLIC_SUFFIX_PATTERN = /(?:ivka|ivske|ivskyi|skyi|yne)$/i;
const COMMON_MULTI = [
  ["shch", "щ"],
  ["zh", "ж"],
  ["kh", "х"],
  ["ts", "ц"],
  ["ch", "ч"],
  ["sh", "ш"],
  ["yu", "ю"],
  ["ya", "я"],
  ["yo", "ё"],
  ["ye", "е"]
];
const SINGLE_BY_LANGUAGE = {
  ru: {
    a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и", j: "й", k: "к", l: "л", m: "м",
    n: "н", o: "о", p: "п", q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", y: "ы", z: "з"
  },
  bg: {
    a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и", j: "й", k: "к", l: "л", m: "м",
    n: "н", o: "о", p: "п", q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", y: "и", z: "з"
  },
  uk: {
    a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "ґ", h: "г", i: "і", j: "й", k: "к", l: "л", m: "м",
    n: "н", o: "о", p: "п", q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", y: "и", z: "з"
  },
  sr: {
    a: "а", b: "б", c: "ц", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и", j: "ј", k: "к", l: "л", m: "м",
    n: "н", o: "о", p: "п", q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", y: "и", z: "з"
  }
};
const MULTI_BY_LANGUAGE = {
  uk: [["yi", "ї"], ["ye", "є"], ...COMMON_MULTI.filter(([key]) => key !== "ye")],
  sr: [["dzh", "џ"], ["dz", "џ"], ["dj", "ђ"], ["lj", "љ"], ["nj", "њ"], ...COMMON_MULTI],
  ru: COMMON_MULTI,
  bg: COMMON_MULTI
};

export function transliterationLookupCandidates(value, options = {}) {
  const text = normalizeSelection(value);
  if (!text || detectScript(text).script !== "Latin") {
    return [];
  }

  const languages = transliterationLanguages(text, options.languageHints);
  const candidates = [];
  const seen = new Set();

  for (const language of languages) {
    const sourceForm = transliterateLatinToCyrillic(text, language);
    const key = `${sourceForm}|${language}`;
    if (!sourceForm || sourceForm === text || seen.has(key)) {
      continue;
    }

    seen.add(key);
    candidates.push({
      sourceForm,
      language,
      script: "Cyrillic"
    });

    if (candidates.length >= 3) {
      break;
    }
  }

  return candidates;
}

function transliterationLanguages(text, languageHints = []) {
  const hinted = normalizeLanguageHints(languageHints)
    .filter((language) => CYRILLIC_HINT_LANGUAGES.has(language));
  if (hinted.length) {
    return hinted;
  }

  if (CYRILLIC_SUFFIX_PATTERN.test(text)) {
    return ["uk"];
  }

  return STRONG_CYRILLIC_PATTERN.test(text) ? ["ru"] : [];
}

function transliterateLatinToCyrillic(text, language) {
  return text.replace(/[A-Za-z]+/g, (word) => transliterateWord(word, language));
}

function transliterateWord(word, language) {
  const multi = MULTI_BY_LANGUAGE[language] || COMMON_MULTI;
  const single = SINGLE_BY_LANGUAGE[language] || SINGLE_BY_LANGUAGE.ru;
  const lower = word.toLocaleLowerCase();
  let index = 0;
  let result = "";

  while (index < lower.length) {
    const match = multi.find(([pattern]) => lower.startsWith(pattern, index));
    if (match) {
      result += match[1];
      index += match[0].length;
      continue;
    }

    const character = lower[index];
    result += single[character] || character;
    index += 1;
  }

  return applyWordCase(word, result);
}

function applyWordCase(source, result) {
  if (source.toLocaleUpperCase() === source) {
    return result.toLocaleUpperCase();
  }

  return /^[A-Z]/.test(source)
    ? result[0].toLocaleUpperCase() + result.slice(1)
    : result;
}

function normalizeLanguageHints(value = []) {
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(/[\s,;]+/);
  const seen = new Set();
  const hints = [];

  for (const item of values) {
    const language = String(item || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, "-")
      .match(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/)?.[0]
      ?.split("-")[0] || "";
    if (!language || seen.has(language)) {
      continue;
    }

    seen.add(language);
    hints.push(language);
  }

  return hints;
}
