import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedSummaryText,
  cacheSummaryText,
  isPlainObject,
  memorySummaryText,
  summarizeQueue,
  syncSummaryText
} from "../../src/options/summary-view.js";

test("summarizes local memory counts", () => {
  assert.equal(memorySummaryText({}), "No local entries.");
  assert.equal(memorySummaryText({
    alpha: {
      confirmations: 2,
      corrections: 1,
      requests: 3,
      flags: 4
    },
    beta: {
      confirmations: 5
    }
  }), "2 local entries · 7 confirmations · 1 corrections · 3 requests · 4 wrong-result flags");
});

test("summarizes lookup cache counts", () => {
  const cache = {
    entries: {
      alpha: {
        lookupKey: "alpha",
        term: "Alpha",
        updatedAt: Date.parse("2099-01-02T03:04:05.000Z"),
        result: {
          display: "Alpha",
          sourceForm: "Alpha",
          sourceStatus: "structured-source",
          pronunciation: {
            simple: "al-fa"
          }
        }
      }
    }
  };

  assert.equal(cacheSummaryText({}, () => "date"), "No cached lookups.");
  assert.equal(
    cacheSummaryText(cache, (value) => `date:${value}`),
    "1 cached lookup · updated date:2099-01-02T03:04:05.000Z"
  );
});

test("summarizes sync state and retry queues", () => {
  const queue = [
    {},
    { lastError: "timeout" },
    { attempts: 5 }
  ];

  assert.deepEqual(summarizeQueue(queue), {
    queued: 3,
    failed: 1,
    exhausted: 1
  });
  assert.equal(syncSummaryText(null, []), "No queued submissions.");
  assert.equal(syncSummaryText(null, queue), "3 queued · 1 failed · 1 exhausted");
  assert.equal(syncSummaryText({ queued: 2, failed: 1 }, queue), "2 queued · 1 failed · 0 exhausted");
});

test("summarizes approved shared entries", () => {
  assert.equal(approvedSummaryText({}, {}, () => "date"), "No approved shared entries.");
  assert.equal(
    approvedSummaryText({
      alpha: {},
      beta: {}
    }, {
      pulledAt: "2026-01-02T03:04:05.000Z"
    }, (value) => `date:${value}`),
    "2 approved shared entries · updated date:2026-01-02T03:04:05.000Z"
  );
});

test("detects plain objects for imports", () => {
  assert.equal(isPlainObject({}), true);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject(null), false);
  assert.equal(isPlainObject("value"), false);
});
