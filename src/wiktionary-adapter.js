import {
  createLookupKey,
  createRemoteStructuredResult,
  normalizeSelection
} from "./resolver-core.js";
import { commonsRedirectUrl } from "./wikidata-adapter.js";

const LANGUAGE_CODES = {
  Arabic: "ar",
  Chinese: "zh",
  Dutch: "nl",
  English: "en",
  French: "fr",
  German: "de",
  Greek: "el",
  Irish: "ga",
  Italian: "it",
  Japanese: "ja",
  Latin: "la",
  Persian: "fa",
  Polish: "pl",
  Portuguese: "pt",
  Russian: "ru",
  Spanish: "es",
  Vietnamese: "vi"
};

export function buildWiktionaryResult(query, pageTitle, wikitext) {
  const parsed = parseWiktionaryPronunciation(wikitext);
  if (!parsed.ipa && !parsed.audioFile && !parsed.languageName && !parsed.origin) {
    return null;
  }

  return createRemoteStructuredResult(query, {
    id: `wiktionary:${createLookupKey(pageTitle || query)}`,
    display: pageTitle || query,
    sourceForm: pageTitle || query,
    language: parsed.language || "",
    languageName: parsed.languageName || "",
    category: "dictionary term",
    origin: parsed.origin,
    pronunciation: {
      ipa: parsed.ipa,
      simple: "",
      audio: parsed.audioFile ? [{
        url: commonsRedirectUrl(parsed.audioFile),
        label: "Pronunciation audio",
        source: "Wiktionary",
        quality: "verified"
      }] : []
    },
    sourceStatus: parsed.audioFile ? "verified-audio" : "structured-source",
    confidence: parsed.audioFile ? "high" : parsed.ipa ? "medium" : "low",
    evidence: [
      "Wiktionary pronunciation entry",
      parsed.ipa ? "IPA from Wiktionary" : "",
      parsed.audioFile ? "Pronunciation audio from Wiktionary" : "",
      parsed.origin ? "Origin note from Wiktionary" : ""
    ].filter(Boolean),
    sources: [{ label: "Wiktionary", url: `https://en.wiktionary.org/wiki/${encodeURIComponent(pageTitle || query)}` }]
  });
}

export function parseWiktionaryPronunciation(wikitext = "") {
  const text = String(wikitext || "");
  const languageName = firstLanguageHeading(text);
  const language = LANGUAGE_CODES[languageName] || "";
  const ipa = firstIpa(text);
  const audioFile = firstAudioFile(text);
  const origin = firstEtymologyLine(text);

  return {
    language,
    languageName,
    ipa,
    audioFile,
    origin
  };
}

function firstLanguageHeading(text) {
  const match = text.match(/^==\s*([^=\n]+?)\s*==\s*$/m);
  return normalizeSelection(match?.[1]);
}

function firstIpa(text) {
  const ipaTemplate = text.match(/\{\{IPA(?:char)?\|([^{}]+?)\}\}/i);
  if (ipaTemplate) {
    const parts = ipaTemplate[1]
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
    const ipa = parts.find((part) => /[\/\[\]ˈˌɑɐæɒəɚɛɜɡɪɲɔʃʊʌʒθðŋ]/u.test(part));
    if (ipa) {
      return stripWikitext(ipa);
    }
  }

  const rawIpa = text.match(/(?:IPA|pronunciation)[^/\[]*([/\[][^\n|{}]+?[\/\]])/i);
  return stripWikitext(rawIpa?.[1] || "");
}

function firstAudioFile(text) {
  const audioTemplate = text.match(/\{\{(?:audio|audio-IPA)\|([^{}]+?)\}\}/i);
  if (!audioTemplate) {
    return "";
  }

  const parts = audioTemplate[1]
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  return normalizeSelection(parts.find((part) => /\.(?:ogg|oga|mp3|wav)$/i.test(part)) || "");
}

function firstEtymologyLine(text) {
  const match = text.match(/^===+\s*Etymology(?:\s+\d+)?\s*===+\s*\r?\n([\s\S]*?)(?=^===|\s*$)/im);
  if (!match) {
    return "";
  }

  const line = match[1]
    .split(/\r?\n/)
    .map((value) => stripWikitext(value))
    .find((value) => value && !value.startsWith("*") && !value.startsWith("#"));

  return normalizeSelection(line).slice(0, 180);
}

function stripWikitext(value) {
  return normalizeSelection(String(value || "")
    .replace(/\{\{m\|[^|{}]+\|([^|{}]+).*?\}\}/g, "$1")
    .replace(/\{\{bor\|[^|{}]+\|[^|{}]+\|([^|{}]+).*?\}\}/g, "$1")
    .replace(/\{\{der\|[^|{}]+\|[^|{}]+\|([^|{}]+).*?\}\}/g, "$1")
    .replace(/\{\{inh\|[^|{}]+\|[^|{}]+\|([^|{}]+).*?\}\}/g, "$1")
    .replace(/\{\{[^{}]+?\}\}/g, "")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<!--[\s\S]*?-->/g, ""));
}
