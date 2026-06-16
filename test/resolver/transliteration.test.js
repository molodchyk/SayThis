import assert from "node:assert/strict";
import test from "node:test";
import {
  transliterationLookupCandidates
} from "../../src/resolver/transliteration.js";

test("creates bounded Cyrillic lookup candidates from language hints", () => {
  assert.deepEqual(transliterationLookupCandidates("Moskva", {
    languageHints: ["ru"]
  }), [{
    sourceForm: "Москва",
    language: "ru",
    script: "Cyrillic"
  }]);
});

test("uses strong Latin transliteration markers without explicit hints", () => {
  assert.deepEqual(transliterationLookupCandidates("Zhukov"), [{
    sourceForm: "Жуков",
    language: "ru",
    script: "Cyrillic"
  }]);
});

test("does not create noisy candidates for ordinary Latin text", () => {
  assert.deepEqual(transliterationLookupCandidates("Exampleterm"), []);
  assert.deepEqual(transliterationLookupCandidates("Exampleterm", {
    languageHints: ["pl", "tr"]
  }), []);
});
