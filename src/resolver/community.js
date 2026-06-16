import {
  createLookupKey,
  normalizeSelection
} from "./text.js";
import {
  normalizeAliases,
  normalizeCount,
  normalizeTrustSignals,
  normalizeUrl
} from "./values.js";

export function normalizeCommunityEntries(entries = {}) {
  const rawEntries = Array.isArray(entries)
    ? entries.map((entry) => ["", entry])
    : entries && typeof entries === "object"
      ? Object.entries(entries)
      : [];

  return Object.fromEntries(rawEntries
    .map(([key, entry]) => normalizeCommunityEntry(entry, key))
    .filter((entry) => entry?.lookupKey)
    .map((entry) => [entry.lookupKey, entry]));
}

export function updateCommunityEntries(entries, selection, feedback = {}) {
  const query = normalizeSelection(selection);
  const lookupKey = createLookupKey(query);
  if (!lookupKey) {
    return entries || {};
  }

  const now = new Date().toISOString();
  const existing = { ...((entries || {})[lookupKey] || {}) };
  const next = {
    term: existing.term || query,
    lookupKey,
    confirmations: Number(existing.confirmations || 0),
    flags: Number(existing.flags || 0),
    requests: Number(existing.requests || 0),
    corrections: Number(existing.corrections || 0),
    sourceForm: existing.sourceForm || "",
    aliases: normalizeAliases(existing.aliases),
    language: existing.language || "",
    languageName: existing.languageName || "",
    origin: existing.origin || "",
    ipa: existing.ipa || "",
    simple: existing.simple || "",
    audioUrl: existing.audioUrl || "",
    sourceUrl: existing.sourceUrl || "",
    variantNote: existing.variantNote || "",
    trustSignals: normalizeTrustSignals(existing.trustSignals),
    createdAt: existing.createdAt || now,
    updatedAt: now
  };

  if (feedback.kind === "confirm") {
    next.confirmations += 1;
  } else if (feedback.kind === "wrong") {
    next.flags += 1;
  } else if (feedback.kind === "missing") {
    next.requests += 1;
  } else if (feedback.kind === "correction") {
    next.corrections += 1;
    for (const field of ["sourceForm", "aliases", "language", "languageName", "origin", "ipa", "simple", "audioUrl", "sourceUrl", "variantNote"]) {
      const value = field === "aliases"
        ? normalizeAliases(feedback[field])
        : field === "audioUrl" || field === "sourceUrl"
          ? normalizeUrl(feedback[field])
          : normalizeSelection(feedback[field]);
      if (Array.isArray(value) ? value.length : Boolean(value)) {
        next[field] = value;
      }
    }
  }

  next.trustSignals = communityTrustSignals(next.trustSignals, feedback, next);

  return {
    ...(entries || {}),
    [lookupKey]: next
  };
}

export function applyCommunitySummary(result, communityEntry) {
  if (!result || !communityEntry) {
    return result;
  }

  return withCommunitySummary(result, communityEntry);
}

export function findCommunityEntry(lookupKey, entries = {}) {
  if (Array.isArray(entries)) {
    return entries.find((entry) => communityEntryKeys(entry).includes(lookupKey));
  }

  return entries[lookupKey] || Object.values(entries).find((entry) => communityEntryKeys(entry).includes(lookupKey)) || null;
}

export function hasCommunityPronunciationData(entry = {}) {
  return Boolean(entry.sourceForm || entry.language || entry.ipa || entry.simple || entry.audioUrl || entry.sourceUrl || entry.variantNote);
}

export function withCommunitySummary(result, communityEntry) {
  if (!communityEntry) {
    return result;
  }

  return {
    ...result,
    community: communitySummary(communityEntry)
  };
}

export function communitySummary(entry = {}) {
  return {
    confirmations: Number(entry.confirmations || 0),
    flags: Number(entry.flags || 0),
    requests: Number(entry.requests || 0),
    corrections: Number(entry.corrections || 0),
    updatedAt: entry.updatedAt || ""
  };
}

export function emptyCommunity() {
  return {
    confirmations: 0,
    flags: 0,
    requests: 0,
    corrections: 0,
    updatedAt: ""
  };
}

export function communitySourceLinks(entry = {}) {
  return [
    entry.sourceUrl ? { label: "Community source", url: entry.sourceUrl } : null,
    entry.audioUrl ? { label: "Community audio source", url: entry.audioUrl } : null
  ].filter(Boolean);
}

function normalizeCommunityEntry(entry = {}, fallbackLookupKey = "") {
  const term = normalizeSelection(entry.term || entry.display || entry.sourceForm);
  const lookupKey = createLookupKey(entry.lookupKey || fallbackLookupKey || term);
  if (!lookupKey || !hasCommunityEntryContent(entry)) {
    return null;
  }

  return {
    term: term || normalizeSelection(entry.sourceForm) || normalizeSelection(fallbackLookupKey),
    lookupKey,
    confirmations: normalizeCount(entry.confirmations),
    flags: normalizeCount(entry.flags),
    requests: normalizeCount(entry.requests),
    corrections: normalizeCount(entry.corrections),
    sourceForm: normalizeSelection(entry.sourceForm),
    aliases: normalizeAliases(entry.aliases),
    language: normalizeLanguage(entry.language),
    languageName: normalizeSelection(entry.languageName),
    origin: normalizeSelection(entry.origin),
    ipa: normalizeSelection(entry.ipa),
    simple: normalizeSelection(entry.simple),
    audioUrl: normalizeUrl(entry.audioUrl),
    sourceUrl: normalizeUrl(entry.sourceUrl),
    variantNote: normalizeSelection(entry.variantNote),
    trustSignals: normalizeTrustSignals(entry.trustSignals),
    createdAt: normalizeSelection(entry.createdAt),
    updatedAt: normalizeSelection(entry.updatedAt)
  };
}

function hasCommunityEntryContent(entry = {}) {
  return Boolean(
    normalizeSelection(entry.lookupKey || entry.term || entry.display || entry.sourceForm) ||
    normalizeAliases(entry.aliases).length ||
    normalizeSelection(entry.language || entry.languageName || entry.origin || entry.ipa || entry.simple || entry.audioUrl || entry.sourceUrl || entry.variantNote) ||
    normalizeTrustSignals(entry.trustSignals).length ||
    normalizeCount(entry.confirmations) ||
    normalizeCount(entry.flags) ||
    normalizeCount(entry.requests) ||
    normalizeCount(entry.corrections)
  );
}

function communityTrustSignals(existingSignals, feedback = {}, entry = {}) {
  const signals = normalizeTrustSignals(existingSignals);

  if (feedback.kind === "confirm") {
    signals.push("local-confirmed");
  }
  if (feedback.kind === "correction") {
    signals.push("local-correction");
  }
  if (entry.sourceUrl) {
    signals.push("source-backed");
  }
  if (entry.audioUrl) {
    signals.push("audio-backed");
  }
  if (entry.variantNote) {
    signals.push("variant-noted");
  }

  return normalizeTrustSignals(signals);
}

function communityEntryKeys(entry = {}) {
  return [
    entry.lookupKey,
    entry.term,
    entry.sourceForm,
    ...normalizeAliases(entry.aliases)
  ]
    .map(createLookupKey)
    .filter(Boolean);
}

function normalizeLanguage(language) {
  return String(language || "").trim();
}
