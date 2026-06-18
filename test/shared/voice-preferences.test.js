import assert from "node:assert/strict";
import test from "node:test";
import {
  baseVoiceLocale,
  normalizeVoiceLocale,
  preferredVoiceNamesForLocale,
  preferredVoiceScoreForLabel
} from "../../src/shared/voice-preferences.js";

const UK_UA_CHIRP3_HD_VOICES = [
  "uk-UA-Chirp3-HD-Gacrux",
  "uk-UA-Chirp3-HD-Achernar",
  "uk-UA-Chirp3-HD-Aoede",
  "uk-UA-Chirp3-HD-Autonoe",
  "uk-UA-Chirp3-HD-Callirrhoe",
  "uk-UA-Chirp3-HD-Despina",
  "uk-UA-Chirp3-HD-Erinome",
  "uk-UA-Chirp3-HD-Kore",
  "uk-UA-Chirp3-HD-Laomedeia",
  "uk-UA-Chirp3-HD-Leda",
  "uk-UA-Chirp3-HD-Pulcherrima",
  "uk-UA-Chirp3-HD-Sulafat",
  "uk-UA-Chirp3-HD-Vindemiatrix",
  "uk-UA-Chirp3-HD-Zephyr"
];

test("preserves preferred HD voice inventory by locale", () => {
  assert.deepEqual(preferredVoiceNamesForLocale("uk-UA"), UK_UA_CHIRP3_HD_VOICES);
  assert.deepEqual(preferredVoiceNamesForLocale("uk"), UK_UA_CHIRP3_HD_VOICES);
  assert.deepEqual(preferredVoiceNamesForLocale("pl-PL"), []);
});

test("normalizes voice locales for matching browser and provider voices", () => {
  assert.equal(normalizeVoiceLocale("uk_ua"), "uk-UA");
  assert.equal(normalizeVoiceLocale("PL-pl"), "pl-PL");
  assert.equal(baseVoiceLocale("uk-UA"), "uk");
  assert.equal(normalizeVoiceLocale("not a locale"), "");
});

test("scores preferred voice labels by configured order", () => {
  assert.ok(
    preferredVoiceScoreForLabel("Service uk-UA-Chirp3-HD-Gacrux (Google)", "uk-UA") >
      preferredVoiceScoreForLabel("Service uk-UA-Chirp3-HD-Zephyr (Google)", "uk-UA")
  );
  assert.equal(preferredVoiceScoreForLabel("Generic exact", "uk-UA"), 0);
});
