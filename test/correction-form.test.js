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
    }
  });

  assert.deepEqual(values, {
    sourceForm: "chiaroscuro",
    language: "it",
    languageName: "Italian",
    simple: "kee-ah-roh-SKOO-roh",
    ipa: "kjaroˈskuːro",
    origin: "Italian",
    audioUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Example.ogg",
    variantNote: "regional studio pronunciation"
  });
});

test("builds correction feedback with audio source and variant note", () => {
  const feedback = correctionFeedbackFromValues({
    sourceForm: "  gnocchi ",
    language: "it",
    languageName: "Italian",
    simple: " NYOH-kee ",
    ipa: "ˈɲɔkki",
    origin: "Italian",
    audioUrl: " https://example.com/audio.ogg ",
    variantNote: "Northern Italian variant"
  });

  assert.deepEqual(feedback, {
    kind: "correction",
    sourceForm: "gnocchi",
    language: "it",
    languageName: "Italian",
    simple: "NYOH-kee",
    ipa: "ˈɲɔkki",
    origin: "Italian",
    audioUrl: "https://example.com/audio.ogg",
    variantNote: "Northern Italian variant"
  });
});

test("detects whether a correction carries pronunciation data", () => {
  assert.equal(hasCorrectionDetail(correctionFeedbackFromValues({})), false);
  assert.equal(hasCorrectionDetail(correctionFeedbackFromValues({ simple: "NYOH-kee" })), true);
});
