const SOURCE_LABELS = {
  "verified-audio": "Verified audio",
  "generated-audio": "Generated audio",
  "community-confirmed": "Community confirmed",
  "structured-source": "Structured source",
  "generated-from-source": "Generated from source form",
  "best-effort-fallback": "Best-effort fallback",
  unknown: "Unknown"
};

const CONFIDENCE_RANK = {
  high: 5,
  medium: 3,
  low: 1,
  unknown: 0
};

export function confidenceRank(confidence) {
  return CONFIDENCE_RANK[confidence] || 0;
}

export function normalizeConfidence(confidence) {
  return CONFIDENCE_RANK[confidence] !== undefined ? confidence : "unknown";
}

export function normalizeSourceStatus(status) {
  return SOURCE_LABELS[status] ? status : "unknown";
}

export function sourceLabelForStatus(status) {
  return SOURCE_LABELS[status] || SOURCE_LABELS.unknown;
}

export function strongerConfidence(left, right) {
  return confidenceRank(right) > confidenceRank(left) ? right : left;
}
