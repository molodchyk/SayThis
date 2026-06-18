import assert from "node:assert/strict";
import test from "node:test";
import {
  createRemoteStructuredResult,
  resultToSpeechOptions
} from "../../src/resolver-core.js";
import {
  normalizeSpeakableGuide,
  pronunciationGuideFromSourceForm,
  withGeneratedPronunciationGuide
} from "../../src/resolver/pronunciation-guide.js";

test("builds a readable guide from Cyrillic source forms", () => {
  const sourceForm = "\u041a\u0430\u043b\u0438\u043d\u0435";

  assert.equal(pronunciationGuideFromSourceForm(sourceForm, "uk"), "kah-lih-neh");
  assert.equal(pronunciationGuideFromSourceForm("Exampleterm", "en"), "");
});

test("keeps supplied simple guides ahead of generated guides", () => {
  const pronunciation = withGeneratedPronunciationGuide({
    simple: "supplied-guide"
  }, "\u041a\u0430\u043b\u0438\u043d\u0435", "uk");

  assert.equal(pronunciation.simple, "supplied-guide");
});

test("accepts speakable guides and rejects explanatory guide prose", () => {
  assert.equal(normalizeSpeakableGuide("p-shih-kla-doh-voh"), "p-shih-kla-doh-voh");
  assert.equal(normalizeSpeakableGuide("SEER-sha or SUR-sha"), "SEER-sha or SUR-sha");
  assert.equal(normalizeSpeakableGuide("U S A"), "U S A");
  assert.equal(normalizeSpeakableGuide("ngwee-en; often shortened in English contexts"), "");
  assert.equal(normalizeSpeakableGuide("English pronunciations vary; source form should use a matching voice"), "");
  assert.equal(normalizeSpeakableGuide("SEER-sha or SUR-sha, depending on speaker"), "");
});

test("keeps generated guides available without replacing source-form speech", () => {
  const sourceForm = "\u041a\u0430\u043b\u0438\u043d\u0435";
  const result = createRemoteStructuredResult("Exampletown", {
    id: "remote:exampletown",
    display: "Exampletown",
    sourceForm,
    language: "uk"
  });
  const speech = resultToSpeechOptions(result);

  assert.equal(result.pronunciation.simple, "kah-lih-neh");
  assert.equal(result.speakText, sourceForm);
  assert.equal(speech.text, sourceForm);
  assert.equal(speech.options.lang, "uk-UA");
});
