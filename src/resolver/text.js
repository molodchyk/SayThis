export const MAX_SELECTION_LENGTH = 160;

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const SPACE_OR_DASH = /[\s\-_]+/g;
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export function normalizeSelection(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SELECTION_LENGTH);
}

export function createLookupKey(value) {
  return normalizeSelection(value)
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(EDGE_PUNCTUATION, "")
    .replace(SPACE_OR_DASH, " ")
    .toLocaleLowerCase();
}

export function detectScript(value) {
  const text = normalizeSelection(value);
  const counts = new Map();

  for (const char of text) {
    const code = char.codePointAt(0);
    const script = scriptForCodePoint(code);
    if (!script) {
      continue;
    }
    counts.set(script, (counts.get(script) || 0) + 1);
  }

  if (!counts.size) {
    return { script: "Unknown", confidence: "unknown", counts: {} };
  }

  const sorted = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  const [script, count] = sorted[0];
  const total = sorted.reduce((sum, [, value]) => sum + value, 0);
  const ratio = count / total;

  return {
    script,
    confidence: ratio >= 0.8 ? "high" : "medium",
    counts: Object.fromEntries(sorted)
  };
}

function scriptForCodePoint(code) {
  if (inRange(code, 0x0041, 0x007a) || inRange(code, 0x00c0, 0x024f) || inRange(code, 0x1e00, 0x1eff)) {
    return "Latin";
  }
  if (inRange(code, 0x0370, 0x03ff) || inRange(code, 0x1f00, 0x1fff)) {
    return "Greek";
  }
  if (inRange(code, 0x0400, 0x052f)) {
    return "Cyrillic";
  }
  if (inRange(code, 0x0530, 0x058f)) {
    return "Armenian";
  }
  if (inRange(code, 0x0590, 0x05ff)) {
    return "Hebrew";
  }
  if (inRange(code, 0x0600, 0x06ff) || inRange(code, 0x0750, 0x077f) || inRange(code, 0x08a0, 0x08ff)) {
    return "Arabic";
  }
  if (inRange(code, 0x0900, 0x097f)) {
    return "Devanagari";
  }
  if (inRange(code, 0x0e00, 0x0e7f)) {
    return "Thai";
  }
  if (inRange(code, 0x3040, 0x309f)) {
    return "Hiragana";
  }
  if (inRange(code, 0x30a0, 0x30ff)) {
    return "Katakana";
  }
  if (inRange(code, 0x4e00, 0x9fff)) {
    return "Han";
  }
  if (inRange(code, 0xac00, 0xd7af)) {
    return "Hangul";
  }
  return "";
}

function inRange(code, start, end) {
  return code >= start && code <= end;
}
