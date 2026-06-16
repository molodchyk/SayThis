import assert from "node:assert/strict";
import test from "node:test";
import {
  correctionFeedbackFromValues,
  correctionValuesFromResult,
  hasCorrectionDetail
} from "../src/correction-form.js";

test("prefills correction values from resolver result", () => {
  const values = correctionValuesFromResult({
    sourceForm: "chiaroscuro",
    aliases: ["light-dark", "chiaro scuro"],
    language: "it",
    languageName: "Italian",
    origin: "Italian",
    notes: "regional studio pronunciation",
    pronunciation: {
      ipa: "kjaroˈskuːro",
      simple: "kee-ah-roh-SKOO-roh",
      audio: [{
        url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Example.ogg",
        label: "Pronunciation audio",
        quality: "verified"
      }]
    },
    sources: [{
      label: "Wiktionary",
      url: "https://en.wiktionary.org/wiki/chiaroscuro"
    }]
  });

  assert.deepEqual(values, {
    sourceForm: "chiaroscuro",
    aliases: "light-dark; chiaro scuro",
    language: "it",
    languageName: "Italian",
    simple: "kee-ah-roh-SKOO-roh",
    ipa: "kjaroˈskuːro",
    origin: "Italian",
    audioUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Example.ogg",
    sourceUrl: "https://en.wiktionary.org/wiki/chiaroscuro",
    variantNote: "regional studio pronunciation"
  });
});

test("prefills variant note aliases from resolver result", () => {
  const values = correctionValuesFromResult({
    sourceForm: "Exampleterm",
    variantNote: "Regional pronunciation variant"
  });

  assert.equal(values.variantNote, "Regional pronunciation variant");
});

test("builds correction feedback with audio source and variant note", () => {
  const feedback = correctionFeedbackFromValues({
    sourceForm: "  gnocchi ",
    aliases: "gnocco; gnocchi",
    language: "it",
    languageName: "Italian",
    simple: " NYOH-kee ",
    ipa: "ˈɲɔkki",
    origin: "Italian",
    audioUrl: " https://example.com/audio.ogg ",
    sourceUrl: " https://example.com/source ",
    variantNote: "Northern Italian variant"
  });

  assert.deepEqual(feedback, {
    kind: "correction",
    sourceForm: "gnocchi",
    aliases: ["gnocco", "gnocchi"],
    language: "it",
    languageName: "Italian",
    simple: "NYOH-kee",
    ipa: "ˈɲɔkki",
    origin: "Italian",
    audioUrl: "https://example.com/audio.ogg",
    sourceUrl: "https://example.com/source",
    variantNote: "Northern Italian variant"
  });
});

test("drops unsafe correction URLs", () => {
  const feedback = correctionFeedbackFromValues({
    audioUrl: "javascript:alert(1)",
    sourceUrl: "http://example.com/source",
    simple: "SAFE-guide"
  });

  assert.equal(feedback.audioUrl, "");
  assert.equal(feedback.sourceUrl, "");
  assert.equal(feedback.simple, "SAFE-guide");
});

test("detects whether a correction carries pronunciation data", () => {
  assert.equal(hasCorrectionDetail(correctionFeedbackFromValues({})), false);
  assert.equal(hasCorrectionDetail(correctionFeedbackFromValues({ aliases: "alternate" })), true);
});
