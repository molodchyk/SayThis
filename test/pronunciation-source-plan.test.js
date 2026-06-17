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

test("uses variant spellings as pronunciation-audio candidates", () => {
  const candidates = pronunciationLookupCandidates("Exampleterm", {
    display: "Exampleterm",
    sourceForm: "Sourceform",
    aliases: ["Alias one"],
    variants: "Variant one; Variant two",
    language: "la",
    alternateResults: [{
      display: "Other form",
      sourceForm: "Other source",
      variants: ["Other variant"],
      language: "de"
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
    word: "Variant one",
    language: "la"
  }, {
    word: "Variant two",
    language: "la"
  }]);
});

test("uses configured pronunciation language over resolved hints", () => {
  const candidates = pronunciationLookupCandidates("gnocchi", {
    display: "Gnocchi",
    sourceForm: "gnocchi",
    language: "it"
  }, {
    language: "en",
    languageHints: ["pl", "it"]
  });

  assert.deepEqual(candidates, [{
    word: "gnocchi",
    language: "en"
  }]);
});

test("can retry configured pronunciation language with resolved hints", () => {
  const candidates = pronunciationLookupCandidates("gnocchi", {
    display: "Gnocchi",
    sourceForm: "gnocchi",
    language: "it"
  }, {
    language: "en",
    includeResolvedLanguageFallback: true
  });

  assert.deepEqual(candidates, [{
    word: "gnocchi",
    language: "en"
  }, {
    word: "gnocchi",
    language: "it"
  }]);
});

test("uses lookup language hints for pronunciation audio when language is unresolved", () => {
  const candidates = pronunciationLookupCandidates("Exampleterm", null, {
    languageHints: "pl, it, invalid!, es"
  });

  assert.deepEqual(candidates, [{
    word: "Exampleterm",
    language: "pl"
  }, {
    word: "Exampleterm",
    language: "it"
  }, {
    word: "Exampleterm",
    language: "es"
  }]);
});

test("adds lookup language hints after resolved pronunciation language", () => {
  const candidates = pronunciationLookupCandidates("Quixote", {
    display: "Quixote",
    sourceForm: "Quijote",
    language: "es"
  }, {
    languageHints: ["pt", "es"]
  });

  assert.deepEqual(candidates, [{
    word: "Quijote",
    language: "es"
  }, {
    word: "Quijote",
    language: "pt"
  }, {
    word: "Quixote",
    language: "es"
  }, {
    word: "Quixote",
    language: "pt"
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
    variants: ["Athene"],
    alternateResults: [{
      display: "Athens",
      sourceForm: "Athenae",
      language: "la"
    }]
  }, {
    limit: 3
  });

  assert.deepEqual(candidates, [{
    word: "Αθήνα",
    language: "el"
  }, {
    word: "Athina",
    language: "el"
  }, {
    word: "Athene",
    language: "el"
  }]);
});
