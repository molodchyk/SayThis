import {
  createLookupKey,
  createRemoteStructuredResult,
  normalizeSelection
} from "./resolver-core.js";
import { commonsRedirectUrl } from "./wikidata-adapter.js";
import { variantsFromWiktionaryText } from "./wiktionary/variants.js";

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

export function buildWiktionaryResult(query, pageTitle, wikitext, options = {}) {
  const parsed = parseWiktionaryPronunciation(wikitext, options);
  if (!parsed.ipa && !parsed.simple && !hasAudioFiles(parsed) && !parsed.origin && !hasVariants(parsed)) {
    return null;
  }

  const sourceLanguage = normalizeWiktionarySourceLanguage(options.sourceLanguage || "en") || "en";
  const result = createWiktionaryRemoteResult(query, pageTitle, parsed, { sourceLanguage });
  const alternateResults = (parsed.alternateEntries || [])
    .map((entry) => createWiktionaryRemoteResult(query, pageTitle, entry, { sourceLanguage }))
    .filter(Boolean);

  return alternateResults.length
    ? { ...result, alternateResults }
    : result;
}

export function parseWiktionaryPronunciation(wikitext = "", options = {}) {
  const text = String(wikitext || "");
  const preferredLanguage = normalizeLanguageHint(options.preferredLanguage || options.language);
  const fallbackLanguage = normalizeLanguageHint(options.sourceLanguage || options.fallbackLanguage);
  const entries = languageEntries(text)
    .map(parseLanguageEntry)
    .map((entry) => applyFallbackLanguage(entry, fallbackLanguage))
    .filter(entryHasLookupData);
  const primary = choosePrimaryEntry(entries, preferredLanguage);

  if (!primary) {
    return {
      language: "",
      languageName: "",
      ipa: "",
      simple: "",
      audioFile: "",
      audioFiles: [],
      origin: "",
      root: "",
      variants: [],
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

function createWiktionaryRemoteResult(query, pageTitle, parsed, options = {}) {
  const audioFiles = normalizedAudioFiles(parsed);
  const sourceLanguage = normalizeWiktionarySourceLanguage(options.sourceLanguage || parsed.sourceLanguage || "en") || "en";
  return createRemoteStructuredResult(query, {
    id: wiktionaryResultId(pageTitle || query, sourceLanguage),
    display: pageTitle || query,
    sourceForm: pageTitle || query,
    language: parsed.language || "",
    languageName: parsed.languageName || "",
    category: "dictionary term",
    origin: parsed.origin,
    root: parsed.root,
    pronunciation: {
      ipa: parsed.ipa,
      simple: parsed.simple,
      audio: audioFiles.map((audioFile, index) => ({
        url: commonsRedirectUrl(audioFile),
        label: audioFiles.length > 1 ? `Pronunciation audio ${index + 1}` : "Pronunciation audio",
        source: "Wiktionary",
        quality: "verified"
      }))
    },
    sourceStatus: audioFiles.length ? "verified-audio" : "structured-source",
    confidence: audioFiles.length ? "high" : parsed.ipa ? "medium" : "low",
    variants: parsed.variants || [],
    evidence: [
      "Wiktionary pronunciation entry",
      sourceLanguage !== "en" ? `Wiktionary edition: ${sourceLanguage}` : "",
      parsed.languageName ? `Language section: ${parsed.languageName}` : "",
      parsed.ipa ? "IPA from Wiktionary" : "",
      audioFiles.length ? "Pronunciation audio from Wiktionary" : "",
      audioFiles.length > 1 ? `Additional Wiktionary pronunciation audio: ${audioFiles.length - 1}` : "",
      hasVariants(parsed) ? `Wiktionary alternative forms: ${parsed.variants.length}` : "",
      parsed.origin ? "Origin note from Wiktionary" : "",
      parsed.root ? "Root from Wiktionary" : ""
    ].filter(Boolean),
    sources: [{ label: sourceLanguage === "en" ? "Wiktionary" : `Wiktionary (${sourceLanguage})`, url: wiktionaryPageUrl(pageTitle || query, sourceLanguage) }]
  });
}

export function wiktionarySourceLanguages(options = {}) {
  const values = [
    "en",
    options.sourceLanguage,
    options.language,
    options.preferredLanguage,
    ...(Array.isArray(options.languageHints) ? options.languageHints : String(options.languageHints || "").split(/[\s,;]+/))
  ];
  const seen = new Set();
  const languages = [];

  for (const value of values) {
    const language = normalizeWiktionarySourceLanguage(value);
    if (!language || seen.has(language)) {
      continue;
    }

    seen.add(language);
    languages.push(language);
    if (languages.length >= 4) {
      break;
    }
  }

  return languages;
}

export function buildWiktionaryApiUrl(query, sourceLanguage = "en") {
  const language = normalizeWiktionarySourceLanguage(sourceLanguage);
  const title = normalizeSelection(query);
  if (!language || !title) {
    return "";
  }

  const params = new URLSearchParams({
    action: "query",
    prop: "revisions",
    titles: title,
    rvslots: "main",
    rvprop: "content",
    format: "json",
    formatversion: "2",
    origin: "*"
  });

  return `https://${language}.wiktionary.org/w/api.php?${params.toString()}`;
}

export function wiktionaryPageUrl(pageTitle, sourceLanguage = "en") {
  const language = normalizeWiktionarySourceLanguage(sourceLanguage) || "en";
  return `https://${language}.wiktionary.org/wiki/${encodeURIComponent(normalizeSelection(pageTitle))}`;
}

function parseLanguageEntry(section) {
  const languageName = normalizeSelection(section.languageName);
  const body = section.body || "";
  const audioFiles = audioFilesFromText(body);
  const origin = firstEtymologyLine(body);

  return {
    language: LANGUAGE_CODES[languageName] || "",
    languageName,
    ipa: firstIpa(body),
    simple: firstSimpleGuide(body),
    audioFile: audioFiles[0] || "",
    audioFiles,
    origin,
    root: rootFromEtymology(origin),
    variants: variantsFromWiktionaryText(body)
  };
}

function applyFallbackLanguage(entry, fallbackLanguage) {
  if (!fallbackLanguage || entry.language || !entryHasPronunciationData(entry)) {
    return entry;
  }

  return {
    ...entry,
    language: fallbackLanguage,
    languageName: "",
    sourceLanguage: fallbackLanguage
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

function choosePrimaryEntry(entries, preferredLanguage = "") {
  return entries
    .map((entry, index) => ({
      entry,
      index,
      score: scoreEntry(entry, preferredLanguage)
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.entry || null;
}

function scoreEntry(entry, preferredLanguage = "") {
  let score = 0;

  if (hasAudioFiles(entry)) {
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

  if (preferredLanguage && baseLanguage(entry.language) === baseLanguage(preferredLanguage)) {
    score += 12;
  }

  return score;
}

function entryHasLookupData(entry) {
  return Boolean(entry.languageName || entry.origin || entry.ipa || entry.simple || hasAudioFiles(entry) || hasVariants(entry));
}

function entryHasPronunciationData(entry) {
  return Boolean(entry.ipa || entry.simple || hasAudioFiles(entry));
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

function audioFilesFromText(text) {
  const seen = new Set();
  const files = [];
  const audioTemplates = String(text || "").matchAll(/\{\{(?:audio|audio-IPA)\|([^{}]+?)\}\}/gi);

  for (const audioTemplate of audioTemplates) {
    const parts = audioTemplate[1]
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
    const file = normalizeSelection(parts.find((part) => /\.(?:ogg|oga|mp3|wav)$/i.test(part)) || "");
    const key = createLookupKey(file);
    if (key && !seen.has(key)) {
      seen.add(key);
      files.push(file);
    }
  }

  return files.slice(0, 4);
}

function normalizedAudioFiles(parsed = {}) {
  const files = Array.isArray(parsed.audioFiles) && parsed.audioFiles.length
    ? parsed.audioFiles
    : [parsed.audioFile];
  const seen = new Set();
  const unique = [];

  for (const file of files) {
    const text = normalizeSelection(file);
    const key = createLookupKey(text);
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(text);
    }
  }

  return unique.slice(0, 4);
}

function hasAudioFiles(entry = {}) {
  return normalizedAudioFiles(entry).length > 0;
}

function hasVariants(entry = {}) {
  return Array.isArray(entry.variants) && entry.variants.length > 0;
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

function normalizeLanguageHint(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .match(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/)?.[0] || "";
}

function normalizeWiktionarySourceLanguage(value) {
  return normalizeLanguageHint(value).split("-")[0];
}

function wiktionaryResultId(value, sourceLanguage) {
  const key = createLookupKey(value);
  return sourceLanguage === "en" ? `wiktionary:${key}` : `wiktionary:${key}:${sourceLanguage}`;
}

function baseLanguage(language) {
  return normalizeLanguageHint(language).split("-")[0];
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

function rootFromEtymology(origin) {
  const text = normalizeSelection(origin).replace(/[.;:,]+$/g, "");
  if (!text) {
    return "";
  }

  const compound = text.match(/\b(?:compound|composed) of\s+(.+?)(?:[.;]|$)/i)?.[1];
  const root = compound || text.split(/\bfrom\s+/i).map(normalizeSelection).filter(Boolean).at(-1) || "";
  return cleanEtymologyRoot(root);
}

function cleanEtymologyRoot(value) {
  return normalizeSelection(value)
    .replace(/^[,;:]+/, "")
    .replace(/[.;:,]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120);
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
