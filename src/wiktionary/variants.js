import {
  createLookupKey,
  normalizeSelection
} from "../resolver/text.js";

export function variantsFromWiktionaryText(text) {
  const seen = new Set();
  const variants = [];

  for (const section of variantSections(text)) {
    for (const line of section.split(/\r?\n/).filter((value) => /^\s*\*/.test(value))) {
      for (const candidate of variantCandidatesFromLine(line)) {
        const key = createLookupKey(candidate);
        if (!key || seen.has(key)) {
          continue;
        }

        seen.add(key);
        variants.push(candidate);
        if (variants.length >= 8) {
          return variants;
        }
      }
    }
  }

  return variants;
}

function variantSections(text) {
  const headings = [];
  const headingPattern = /^(={3,6})\s*([^=\n]+?)\s*\1\s*$/gm;
  let match;

  while ((match = headingPattern.exec(text)) !== null) {
    headings.push({
      index: match.index,
      level: match[1].length,
      title: normalizeSelection(match[2]),
      bodyStart: headingPattern.lastIndex
    });
  }

  return headings
    .filter((heading) => isVariantSectionTitle(heading.title))
    .map((heading) => {
      const next = headings.find((candidate) => candidate.index > heading.index && candidate.level <= heading.level);
      return text.slice(heading.bodyStart, next?.index || text.length);
    });
}

function isVariantSectionTitle(title) {
  return /^(?:alternative forms?|alternative spellings?|variant forms?|variants)$/i.test(title);
}

function variantCandidatesFromLine(line) {
  const candidates = [
    ...variantTemplateCandidates(line),
    ...variantLinkCandidates(line)
  ];

  if (candidates.length) {
    return candidates.map(cleanVariantCandidate).filter(Boolean);
  }

  return stripWikitext(String(line || "")
    .replace(/^\s*\*+\s*/, "")
    .replace(/\([^)]*\)/g, ""))
    .split(/\s*(?:[;,]|\bor\b)\s*/i)
    .map(cleanVariantCandidate)
    .filter(Boolean);
}

function variantTemplateCandidates(line) {
  const candidates = [];
  const templates = String(line || "").matchAll(/\{\{([^{}]+?)\}\}/g);

  for (const template of templates) {
    const [rawName, ...rawValues] = template[1].split("|");
    const name = normalizeTemplateName(rawName);
    if (!isVariantTemplateName(name)) {
      continue;
    }

    const values = rawValues
      .map((value) => stripWikitext(value))
      .filter((value) => value && !value.includes("="));

    if (looksLikeLanguageCode(values[0])) {
      values.shift();
    }

    candidates.push(...isSingleTermTemplateName(name) ? values.slice(0, 1) : values);
  }

  return candidates;
}

function variantLinkCandidates(line) {
  return [...String(line || "").matchAll(/\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|([^\]]+))?\]\]/g)]
    .map((match) => stripWikitext(match[2] || match[1]));
}

function normalizeTemplateName(value) {
  return normalizeSelection(value)
    .toLowerCase()
    .replace(/_/g, " ");
}

function isVariantTemplateName(name) {
  return [
    "alt",
    "alter",
    "alternative form",
    "alternative forms",
    "alternative spelling",
    "alternative spellings",
    "l",
    "link",
    "m",
    "mention"
  ].includes(name);
}

function isSingleTermTemplateName(name) {
  return ["l", "link", "m", "mention"].includes(name);
}

function looksLikeLanguageCode(value) {
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(String(value || "").trim());
}

function cleanVariantCandidate(value) {
  const cleaned = normalizeSelection(String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/^[*#:;\s]+/, "")
    .replace(/["'`]+$/g, "")
    .replace(/^["'`]+/g, "")
    .replace(/[.;:,]+$/g, ""));

  if (!cleaned || cleaned.length > 80 || /^(?:and|or)$/i.test(cleaned)) {
    return "";
  }

  return createLookupKey(cleaned) ? cleaned : "";
}

function stripWikitext(value) {
  return normalizeSelection(String(value || "")
    .replace(/\{\{m\|[^|{}]+\|([^|{}]+).*?\}\}/g, "$1")
    .replace(/\{\{[^{}]+?\}\}/g, "")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<!--[\s\S]*?-->/g, ""));
}
