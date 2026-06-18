import {
  detectScript,
  normalizeSelection
} from "./text.js";

const CYRILLIC_VOWELS = new Set([
  "\u0430",
  "\u0435",
  "\u0454",
  "\u0451",
  "\u0438",
  "\u0456",
  "\u0457",
  "\u043e",
  "\u0443",
  "\u044b",
  "\u044d",
  "\u044e",
  "\u044f"
]);
const CYRILLIC_SOUND_MAP = {
  "\u0430": "ah",
  "\u0431": "b",
  "\u0432": "v",
  "\u0433": "h",
  "\u0491": "g",
  "\u0434": "d",
  "\u0435": "eh",
  "\u0454": "yeh",
  "\u0436": "zh",
  "\u0437": "z",
  "\u0438": "ih",
  "\u0456": "ee",
  "\u0457": "yee",
  "\u0439": "y",
  "\u043a": "k",
  "\u043b": "l",
  "\u043c": "m",
  "\u043d": "n",
  "\u043e": "oh",
  "\u043f": "p",
  "\u0440": "r",
  "\u0441": "s",
  "\u0442": "t",
  "\u0443": "oo",
  "\u0444": "f",
  "\u0445": "kh",
  "\u0446": "ts",
  "\u0447": "ch",
  "\u0448": "sh",
  "\u0449": "shch",
  "\u044e": "yoo",
  "\u044f": "yah",
  "\u0451": "yoh",
  "\u044b": "ih",
  "\u044d": "eh"
};
const GUIDE_PROSE_MARKERS = /\b(?:context|contexts|depending|often|pronunciation|pronunciations|pronounced|speaker|speakers|source form|usually|varies|vary|voice)\b/i;

export function pronunciationGuideFromSourceForm(sourceForm, language = "") {
  const text = normalizeSelection(sourceForm);
  if (!text || detectScript(text).script !== "Cyrillic") {
    return "";
  }

  return text
    .split(/\s+/)
    .map(cyrillicWordGuide)
    .filter(Boolean)
    .join(" ");
}

export function normalizeSpeakableGuide(value) {
  const guide = normalizeSelection(value);
  if (!guide || guide.length > 120 || /[.;]/.test(guide) || GUIDE_PROSE_MARKERS.test(guide)) {
    return "";
  }

  const words = guide.split(/\s+/);
  if (words.length > 12) {
    return "";
  }

  return guide;
}

export function withGeneratedPronunciationGuide(pronunciation = {}, sourceForm, language = "") {
  const simple = normalizeSelection(pronunciation?.simple);
  if (simple) {
    return pronunciation;
  }

  const guide = pronunciationGuideFromSourceForm(sourceForm, language);
  return guide
    ? { ...pronunciation, simple: guide }
    : pronunciation;
}

function cyrillicWordGuide(word) {
  const syllables = [];
  let syllable = "";

  for (const char of normalizeSelection(word).toLocaleLowerCase()) {
    const sound = CYRILLIC_SOUND_MAP[char];
    if (!sound) {
      continue;
    }

    syllable += sound;
    if (CYRILLIC_VOWELS.has(char)) {
      syllables.push(syllable);
      syllable = "";
    }
  }

  if (syllable) {
    if (syllables.length) {
      syllables[syllables.length - 1] += syllable;
    } else {
      syllables.push(syllable);
    }
  }

  return syllables.join("-");
}
