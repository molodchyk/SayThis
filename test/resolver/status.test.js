import assert from "node:assert/strict";
import test from "node:test";
import {
  sourceLabelForStatus
} from "../../src/resolver-core.js";
import {
  confidenceRank,
  normalizeConfidence,
  normalizeSourceStatus,
  sourceLabelForStatus as sourceLabelForStatusDirect,
  strongerConfidence
} from "../../src/resolver/status.js";

test("maps resolver status helpers from a narrow module", () => {
  assert.equal(confidenceRank("high"), 5);
  assert.equal(normalizeConfidence("unclear"), "unknown");
  assert.equal(normalizeSourceStatus("verified-audio"), "verified-audio");
  assert.equal(normalizeSourceStatus("generated-audio"), "generated-audio");
  assert.equal(normalizeSourceStatus("generated"), "unknown");
  assert.equal(strongerConfidence("low", "medium"), "medium");
  assert.equal(sourceLabelForStatusDirect("generated-audio"), "Generated audio");
  assert.equal(sourceLabelForStatusDirect("structured-source"), "Structured source");
  assert.equal(sourceLabelForStatus("structured-source"), sourceLabelForStatusDirect("structured-source"));
});
