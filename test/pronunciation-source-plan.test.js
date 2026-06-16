import assert from "node:assert/strict";
import test from "node:test";
import {
  additionalPronunciationLookupCandidates,
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

test("uses aliases as pronunciation-audio candidates", () => {
  const candidates = pronunciationLookupCandidates("Exampleterm", {
    display: "Exampleterm",
    sourceForm: "Sourceform",
    aliases: ["Alias one", "Alias two"],
    language: "la",
    alternateResults: [{
      display: "Other form",
      sourceForm: "Other source",
      aliases: ["Other alias"],
      language: "en"
    }]
  });

  assert.deepEqual(candidates, [{
    word: "Sourceform",
    language: "la"
  }, {
    word: "Exampleterm",
    language: "la"
  }, {
    word: "Alias one",
    language: "la"
  }, {
    word: "Alias two",
    language: "la"
  }, {
    word: "Other source",
    language: "en"
  }]);
});

test("splits string aliases for pronunciation-audio candidates", () => {
  const candidates = pronunciationLookupCandidates("Exampleterm", {
    display: "Exampleterm",
    aliases: "First alias; Second alias",
    language: "en"
  });

  assert.deepEqual(candidates, [{
    word: "Exampleterm",
    language: "en"
  }, {
    word: "First alias",
    language: "en"
  }, {
    word: "Second alias",
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

test("plans additional lookup candidates without repeating selected text", () => {
  const candidates = additionalPronunciationLookupCandidates("Athens", {
    display: "Athens",
    sourceForm: "Αθήνα",
    language: "el",
    aliases: ["Athina", "Athens"],
    alternateResults: [{
      display: "Athens",
      sourceForm: "Athenae",
      language: "la"
    }]
  }, {
    limit: 2
  });

  assert.deepEqual(candidates, [{
    word: "Αθήνα",
    language: "el"
  }, {
    word: "Athina",
    language: "el"
  }]);
});
