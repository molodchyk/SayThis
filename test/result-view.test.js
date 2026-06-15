import assert from "node:assert/strict";
import test from "node:test";
import {
  evidenceItemsForResult,
  sourceItemsForResult
} from "../src/result-view.js";

test("builds evidence items with community context", () => {
  const items = evidenceItemsForResult({
    evidence: ["Structured source", ""],
    community: {
      confirmations: 1,
      corrections: 2,
      requests: 3
    }
  });

  assert.deepEqual(items, [
    "Structured source",
    "1 local confirmation",
    "2 local corrections",
    "3 local requests"
  ]);
});

test("builds safe unique source links from result sources and audio", () => {
  const items = sourceItemsForResult({
    sources: [{
      label: "Wiktionary",
      url: "https://en.wiktionary.org/wiki/chiaroscuro"
    }, {
      label: "Plain HTTP",
      url: "http://example.com/source"
    }, {
      label: "Unsafe",
      url: "javascript:alert(1)"
    }],
    pronunciation: {
      audio: [{
        label: "Pronunciation audio",
        url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Example.ogg"
      }, {
        label: "Duplicate",
        url: "https://en.wiktionary.org/wiki/chiaroscuro"
      }]
    }
  });

  assert.deepEqual(items, [{
    label: "Wiktionary",
    url: "https://en.wiktionary.org/wiki/chiaroscuro"
  }, {
    label: "Pronunciation audio",
    url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Example.ogg"
  }]);
});
