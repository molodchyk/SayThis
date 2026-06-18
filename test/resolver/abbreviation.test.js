import assert from "node:assert/strict";
import test from "node:test";
import {
  initialismGuide,
  resolveTerm,
  resultToSpeechOptions
} from "../../src/resolver-core.js";

test("builds letter guides for compact initialisms", () => {
  assert.equal(initialismGuide("PnL"), "P N L");
  assert.equal(initialismGuide("ETF"), "E T F");
  assert.equal(initialismGuide("GPT-5"), "G P T 5");
  assert.equal(initialismGuide("U.S."), "U S");
  assert.equal(initialismGuide("U. S."), "U S");
  assert.equal(initialismGuide("U. S. A."), "U S A");
  assert.equal(initialismGuide("P / L"), "P L");
  assert.equal(initialismGuide("PhD"), "P H D");
  assert.equal(initialismGuide("pH"), "P H");
  assert.equal(initialismGuide("mRNA"), "M R N A");
  assert.equal(initialismGuide("qPCR"), "Q P C R");
  assert.equal(initialismGuide("iOS"), "I O S");
  assert.equal(initialismGuide("eGFR"), "E G F R");
});

test("keeps connector words in common abbreviation guides", () => {
  assert.equal(initialismGuide("S&P"), "S and P");
  assert.equal(initialismGuide("S & P"), "S and P");
  assert.equal(initialismGuide("M&A"), "M and A");
  assert.equal(initialismGuide("R&D"), "R and D");
  assert.equal(initialismGuide("AT&T"), "A T and T");
  assert.equal(initialismGuide("C++"), "C plus plus");
  assert.equal(initialismGuide("A+B"), "A plus B");
});

test("avoids spelling likely acronym words", () => {
  assert.equal(initialismGuide("NASA"), "");
  assert.equal(initialismGuide("NASA&ESA"), "");
  assert.equal(initialismGuide("OpenAI"), "");
  assert.equal(initialismGuide("OAuth"), "");
  assert.equal(initialismGuide("iPhone"), "");
  assert.equal(initialismGuide("eBay"), "");
  assert.equal(initialismGuide("Exampleterm"), "");
  assert.equal(initialismGuide("A I"), "");
  assert.equal(initialismGuide("P n L"), "");
});

test("uses initialism guides for unresolved local fallback speech", () => {
  const result = resolveTerm("PnL", { entries: [] });
  const speech = resultToSpeechOptions(result);

  assert.equal(result.sourceStatus, "best-effort-fallback");
  assert.equal(result.category, "abbreviation");
  assert.equal(result.language, "en");
  assert.equal(result.ttsLang, "en-US");
  assert.equal(result.pronunciation.simple, "P N L");
  assert.equal(result.speakText, "P N L");
  assert.ok(result.evidence.includes("Detected compact initialism"));
  assert.equal(speech.text, "P N L");
  assert.equal(speech.options.lang, "en-US");
});

test("uses spaced punctuation initialism guides for unresolved local fallback speech", () => {
  const result = resolveTerm("S & P", { entries: [] });
  const speech = resultToSpeechOptions(result);

  assert.equal(result.category, "abbreviation");
  assert.equal(result.pronunciation.simple, "S and P");
  assert.equal(result.speakText, "S and P");
  assert.equal(speech.text, "S and P");
});

test("uses technical mixed-case initialism guides for unresolved local fallback speech", () => {
  const result = resolveTerm("mRNA", { entries: [] });
  const speech = resultToSpeechOptions(result);

  assert.equal(result.sourceStatus, "best-effort-fallback");
  assert.equal(result.category, "abbreviation");
  assert.equal(result.pronunciation.simple, "M R N A");
  assert.equal(result.speakText, "M R N A");
  assert.equal(speech.text, "M R N A");
});
