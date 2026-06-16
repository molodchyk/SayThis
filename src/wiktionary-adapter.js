import {
  createLookupKey,
  createRemoteStructuredResult,
  normalizeSelection
} from "./resolver-core.js";
import { commonsRedirectUrl } from "./wikidata-adapter.js";

const LANGUAGE_CODES = {
  Arabic: "ar",
  Armenian: "hy",
  Bulgarian: "bg",
  Chinese: "zh",
  Czech: "cs",
  Danish: "da",
  Dutch: "nl",
  English: "en",
  Finnish: "fi",
  French: "fr",
  German: "de",
  Greek: "el",
  Hebrew: "he",
  Hindi: "hi",
  Hungarian: "hu",
  Irish: "ga",
  Italian: "it",
  Japanese: "ja",
  Korean: "ko",
  Latin: "la",
  Malay: "ms",
  Marathi: "mr",
  Nepali: "ne",
  Norwegian: "no",
  Persian: "fa",
  Polish: "pl",
  Portuguese: "pt",
  Romanian: "ro",
  Russian: "ru",
  Serbian: "sr",
  Spanish: "es",
  Swedish: "sv",
  Thai: "th",
  Turkish: "tr",
  Vietnamese: "vi"
};

export function buildWiktionaryResult(query, pageTitle, wikitext) {
  const parsed = parseWiktionaryPronunciation(wikitext);
  if (!parsed.ipa && !parsed.simple && !parsed.audioFile && !parsed.origin) {
    return null;
  }

  const result = createWiktionaryRemoteResult(query, pageTitle, parsed);
  const alternateResults = (parsed.alternateEntries || [])
    .map((entry) => createWiktionaryRemoteResult(query, pageTitle, entry))
    .filter(Boolean);

  return alternateResults.length
    ? { ...result, alternateResults }
    : result;
}

export function parseWiktionaryPronunciation(wikitext = "") {
  const text = String(wikitext || "");
  const entries = languageEntries(text)
    .map(parseLanguageEntry)
    .filter(entryHasLookupData);
  const primary = choosePrimaryEntry(entries);

  if (!primary) {
    return {
      language: "",
      languageName: "",
      ipa: "",
      simple: "",
      audioFile: "",
      origin: "",
      alternateEntries: []
    };
  }

  return {
    ...primary,
    alternateEntries: entries
      .filter((entry) => entry !== primary && entryHasPronunciationData(entry))
      .slice(0, 4)
  };
}

function createWiktionaryRemoteResult(query, pageTitle, parsed) {
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
      simple: parsed.simple,
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
      parsed.languageName ? `Language section: ${parsed.languageName}` : "",
      parsed.ipa ? "IPA from Wiktionary" : "",
      parsed.audioFile ? "Pronunciation audio from Wiktionary" : "",
      parsed.origin ? "Origin note from Wiktionary" : ""
    ].filter(Boolean),
    sources: [{ label: "Wiktionary", url: `https://en.wiktionary.org/wiki/${encodeURIComponent(pageTitle || query)}` }]
  });
}

function parseLanguageEntry(section) {
  const languageName = normalizeSelection(section.languageName);
  const body = section.body || "";

  return {
    language: LANGUAGE_CODES[languageName] || "",
    languageName,
    ipa: firstIpa(body),
    simple: firstSimpleGuide(body),
    audioFile: firstAudioFile(body),
    origin: firstEtymologyLine(body)
  };
}

function languageEntries(text) {
  const sections = [];
  const headingPattern = /^==\s*([^=\n]+?)\s*==\s*$/gm;
  let match;
  let current = null;

  while ((match = headingPattern.exec(text)) !== null) {
    if (current) {
      current.body = text.slice(current.start, match.index);
      sections.push(current);
    }

    current = {
      languageName: normalizeSelection(match[1]),
      start: headingPattern.lastIndex,
      body: ""
    };
  }

  if (current) {
    current.body = text.slice(current.start);
    sections.push(current);
  }

  return sections.length
    ? sections
    : [{ languageName: "", body: text }];
}

function choosePrimaryEntry(entries) {
  return entries
    .map((entry, index) => ({
      entry,
      index,
      score: scoreEntry(entry)
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.entry || null;
}

function scoreEntry(entry) {
  let score = 0;

  if (entry.audioFile) {
    score += 8;
  }

  if (entry.ipa) {
    score += 6;
  }

  if (entry.simple) {
    score += 4;
  }

  if (entry.origin) {
    score += 2;
  }

  if (entry.language) {
    score += 1;
  }

  return score;
}

function entryHasLookupData(entry) {
  return Boolean(entry.languageName || entry.origin || entry.ipa || entry.simple || entry.audioFile);
}

function entryHasPronunciationData(entry) {
  return Boolean(entry.ipa || entry.simple || entry.audioFile);
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

function firstSimpleGuide(text) {
  const enPrTemplate = text.match(/\{\{enPR\|([^{}]+?)\}\}/i);
  const enPr = firstTemplateValue(enPrTemplate?.[1]);
  if (enPr) {
    return enPr;
  }

  const respellTemplate = text.match(/\{\{(?:respell|enPR respelling)\|([^{}]+?)\}\}/i);
  const respellParts = templateValues(respellTemplate?.[1]);
  const guideParts = /^[a-z]{2,3}$/i.test(respellParts[0] || "")
    ? respellParts.slice(1)
    : respellParts;
  const respell = guideParts.join("-");
  return normalizeSelection(respell);
}

function firstTemplateValue(value) {
  return templateValues(value)[0] || "";
}

function templateValues(value) {
  return String(value || "")
    .split("|")
    .map((part) => stripWikitext(part))
    .filter((part) => part && !part.includes("="));
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
