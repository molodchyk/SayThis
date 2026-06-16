import assert from "node:assert/strict";
import test from "node:test";
import {
  alternateItemsForResult,
  audioItemsForResult,
  evidenceItemsForResult,
  sourceItemsForResult
} from "../src/result-view.js";

test("builds evidence items with community context", () => {
  const items = evidenceItemsForResult({
    trustSignals: ["source-backed"],
    evidence: ["Structured source", ""],
    notes: "Regional variant",
    community: {
      confirmations: 1,
      corrections: 2,
      requests: 3,
      flags: 4
    }
  });

  assert.deepEqual(items, [
    "Trust: source-backed",
    "Structured source",
    "Regional variant",
    "1 local confirmation",
    "2 local corrections",
    "3 local requests"
  ]);
});

test("builds evidence items with wrong-result flag context", () => {
  const items = evidenceItemsForResult({
    community: {
      flags: 1
    }
  });

  assert.deepEqual(items, [
    "1 local wrong-result flag"
  ]);
});

test("builds evidence items with variant note aliases", () => {
  const items = evidenceItemsForResult({
    variantNote: "Regional pronunciation variant"
  });

  assert.deepEqual(items, [
    "Regional pronunciation variant"
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

test("builds playable audio items", () => {
  const items = audioItemsForResult({
    pronunciation: {
      audio: [{
        label: "Primary recording",
        source: "Forvo",
        quality: "verified",
        url: "https://example.com/primary.ogg"
      }, {
        label: "Duplicate",
        url: "https://example.com/primary.ogg"
      }, {
        label: "Unsafe",
        url: "javascript:alert(1)"
      }, {
        source: "Archive",
        url: "chrome-extension://id/audio.ogg"
      }]
    }
  });

  assert.deepEqual(items, [{
    label: "Primary recording",
    source: "Forvo",
    quality: "verified",
    url: "https://example.com/primary.ogg"
  }, {
    label: "Archive",
    source: "Archive",
    quality: "",
    url: "chrome-extension://id/audio.ogg"
  }]);
});

test("builds compact alternate candidate summaries", () => {
  const items = alternateItemsForResult({
    alternateResults: [{
      display: "Exampleterm",
      sourceForm: "Exampleterm",
      languageName: "Latin",
      sourceLabel: "Structured source",
      pronunciation: {
        simple: "eg-ZAM-pluh-term"
      }
    }, {
      display: "",
      sourceForm: "",
      languageName: ""
    }]
  });

  assert.deepEqual(items, [{
    index: 0,
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "Latin",
    source: "Structured source",
    guide: "eg-ZAM-pluh-term",
    summary: "Exampleterm · Latin · Structured source · eg-ZAM-pluh-term"
  }]);
});
