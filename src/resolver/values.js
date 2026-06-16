import {
  normalizeSelection
} from "./text.js";

export function normalizeLongValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2048);
}

export function normalizeUrl(value) {
  const raw = normalizeLongValue(value);
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    return ["https:", "chrome-extension:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

export function normalizeAliases(value) {
  return normalizeUniqueSelectionList(value).slice(0, 12);
}

export function normalizeTrustSignals(value) {
  return normalizeUniqueSelectionList(value).slice(0, 12);
}

export function normalizeCount(value, options = {}) {
  const max = Number.isFinite(Number(options.max)) ? Number(options.max) : 100000;
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.floor(clamp(number, 0, max)) : 0;
}

function normalizeUniqueSelectionList(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\n]/);

  return [...new Set(raw.map(normalizeSelection).filter(Boolean))];
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
