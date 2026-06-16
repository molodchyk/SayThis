import {
  languageNameFromCode
} from "./language.js";
import {
  normalizeSelection
} from "./text.js";

const ORTHOGRAPHIC_HINTS = [
  { language: "pl", markers: "ąćęłńśźżĄĆĘŁŃŚŹŻ" },
  { language: "tr", markers: "ğĞıİşŞ" },
  { language: "es", markers: "ñÑ" },
  { language: "pt", markers: "ãÃõÕ" },
  { language: "cs", markers: "ěĚřŘůŮ" },
  { language: "ro", markers: "ăĂșȘşŞțȚţŢ" },
  { language: "hu", markers: "őŐűŰ" },
  { language: "vi", markers: "ăĂơƠưƯ" },
  { language: "de", markers: "ß" },
  { language: "fr", markers: "œŒæÆèÈêÊëËùÙûÛÿŸ" }
];

export function orthographicLanguageHint(value) {
  const text = normalizeSelection(value);
  if (!text) {
    return null;
  }

  const best = ORTHOGRAPHIC_HINTS
    .map((hint, index) => ({
      ...hint,
      index,
      score: markerScore(text, hint.markers)
    }))
    .filter((hint) => hint.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0];

  if (!best) {
    return null;
  }

  const languageName = languageNameFromCode(best.language);
  return {
    language: best.language,
    languageName,
    confidence: "low",
    evidence: languageName
      ? `Orthography suggests ${languageName}`
      : `Orthography suggests ${best.language}`
  };
}

function markerScore(text, markers) {
  const markerSet = new Set(Array.from(markers));
  const seen = new Set();

  for (const character of Array.from(text)) {
    if (markerSet.has(character)) {
      seen.add(character.toLocaleLowerCase());
    }
  }

  return seen.size;
}
