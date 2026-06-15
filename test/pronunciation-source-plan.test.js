import assert from "node:assert/strict";
import test from "node:test";
import {
  pronunciationLookupCandidates
} from "../src/pronunciation-source-plan.js";

test("prefers resolved source form before selected text", () => {
  const candidates = pronunciationLookupCandidates("Quixote", {
    display: "Quixote",
    sourceForm: "Quijote",
    language: "es"
  });

  assert.deepEqual(candidates, [{
    word: "Quijote",
    language: "es"
  }, {
    word: "Quixote",
    language: "es"
  }]);
});

test("includes useful alternate source forms with their languages", () => {
  const candidates = pronunciationLookupCandidates("Athens", {
    display: "Athens",
    sourceForm: "Αθήνα",
    language: "el",
    alternateResults: [{
      display: "Athens",
      sourceForm: "Athens",
      language: "en"
    }]
  });

  assert.deepEqual(candidates, [{
    word: "Αθήνα",
    language: "el"
  }, {
    word: "Athens",
    language: "el"
  }, {
    word: "Athens",
    language: "en"
  }]);
});

test("uses configured pronunciation language over resolved hints", () => {
  const candidates = pronunciationLookupCandidates("gnocchi", {
    display: "Gnocchi",
    sourceForm: "gnocchi",
    language: "it"
  }, {
    language: "en"
  });

  assert.deepEqual(candidates, [{
    word: "gnocchi",
    language: "en"
  }]);
});

test("falls back to selected text when no structured result exists", () => {
  assert.deepEqual(pronunciationLookupCandidates("  chiaroscuro  ", null), [{
    word: "chiaroscuro",
    language: ""
  }]);
});
