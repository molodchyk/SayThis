import assert from "node:assert/strict";
import test from "node:test";
import {
  hasNonEnglishLanguageSignal,
  hasUsefulSharedAudioTarget,
  isSharedAudioCandidate
} from "../../src/result/shared-audio.js";

test("blocks same-text English structured results", () => {
  assert.equal(isSharedAudioCandidate({
    query: "Exampleterm",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "en",
    ttsLang: "en-US",
    sourceStatus: "structured-source"
  }, "Exampleterm"), false);
});

test("allows resolved same-language source-form differences", () => {
  assert.equal(isSharedAudioCandidate({
    query: "P&L",
    display: "P&L",
    sourceForm: "P N L",
    language: "en",
    ttsLang: "en-US",
    sourceStatus: "structured-source"
  }, "P&L"), true);
});

test("allows non-English language signal when spelling matches", () => {
  assert.equal(isSharedAudioCandidate({
    query: "Saoirse",
    display: "Saoirse",
    sourceForm: "Saoirse",
    language: "ga",
    ttsLang: "ga-IE",
    sourceStatus: "structured-source"
  }, "Saoirse"), true);
});

test("blocks non-English targets routed to an English provider locale", () => {
  assert.equal(isSharedAudioCandidate({
    query: "Saoirse",
    display: "Saoirse",
    sourceForm: "Saoirse",
    language: "ga",
    ttsLang: "en-IE",
    sourceStatus: "structured-source"
  }, "Saoirse"), false);
  assert.equal(hasUsefulSharedAudioTarget("Saoirse", "Saoirse", "ga", "en-IE"), false);
  assert.equal(hasUsefulSharedAudioTarget("Selected", "Resolved", "ga", "en-IE"), false);
});

test("blocks results that already have preferred audio", () => {
  assert.equal(isSharedAudioCandidate({
    query: "Exampleterm",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "ga",
    ttsLang: "ga-IE",
    sourceStatus: "verified-audio",
    pronunciation: {
      audio: [{
        label: "Verified recording",
        url: "https://audio.example/verified.ogg",
        quality: "verified"
      }]
    }
  }, "Exampleterm"), false);
});

test("blocks best-effort fallback results", () => {
  assert.equal(isSharedAudioCandidate({
    query: "Exampleterm",
    display: "Exampleterm",
    sourceForm: "Exampleform",
    language: "en",
    ttsLang: "en-US",
    sourceStatus: "best-effort-fallback"
  }, "Exampleterm"), false);
});

test("recognizes useful targets by source-form differences and language signals", () => {
  assert.equal(hasUsefulSharedAudioTarget("P&L", "P N L", "en", "en-US"), true);
  assert.equal(hasUsefulSharedAudioTarget("Saoirse", "Saoirse", "ga", "ga-IE"), true);
  assert.equal(hasUsefulSharedAudioTarget("Exampleterm", "Exampleterm", "en", "en-US"), false);
  assert.equal(hasNonEnglishLanguageSignal("English"), false);
  assert.equal(hasNonEnglishLanguageSignal("und"), false);
  assert.equal(hasNonEnglishLanguageSignal("ga-IE"), true);
});
