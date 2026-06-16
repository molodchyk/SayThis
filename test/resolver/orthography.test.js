import assert from "node:assert/strict";
import test from "node:test";
import {
  createRemoteStructuredResult,
  mergeRemoteResult,
  orthographicLanguageHint,
  resolveTerm,
  resultToSpeechOptions
} from "../../src/resolver-core.js";

test("detects conservative Latin orthography language hints", () => {
  assert.deepEqual(orthographicLanguageHint("Łódź"), {
    language: "pl",
    languageName: "Polish",
    confidence: "low",
    evidence: "Orthography suggests Polish"
  });
  assert.equal(orthographicLanguageHint("Exampleterm"), null);
  assert.equal(orthographicLanguageHint("Peña")?.language, "es");
  assert.equal(orthographicLanguageHint("Şırnak")?.language, "tr");
});

test("uses orthography hints for unresolved Latin fallback speech", () => {
  const result = resolveTerm("Łódź", { entries: [] });
  const speech = resultToSpeechOptions(result);

  assert.equal(result.sourceStatus, "best-effort-fallback");
  assert.equal(result.language, "pl");
  assert.equal(result.languageName, "Polish");
  assert.equal(result.ttsLang, "pl-PL");
  assert.equal(result.confidence, "low");
  assert.ok(result.evidence.includes("No structured match found"));
  assert.ok(result.evidence.includes("Orthography suggests Polish"));
  assert.equal(speech.options.lang, "pl-PL");
});

test("keeps structured local entries ahead of orthography hints", () => {
  const result = resolveTerm("Quixote", {
    entries: [{
      id: "quixote",
      display: "Quixote",
      sourceForm: "Quijote",
      language: "es",
      sourceStatus: "structured-source"
    }]
  });

  assert.equal(result.id, "quixote");
  assert.equal(result.sourceForm, "Quijote");
  assert.equal(result.language, "es");
  assert.deepEqual(result.evidence, ["Bundled resolver entry"]);
});

test("lets low-confidence structured remote results replace orthography fallback", () => {
  const fallback = resolveTerm("Łódź", { entries: [] });
  const remote = createRemoteStructuredResult("Łódź", {
    id: "remote:lodz",
    display: "Lodz",
    sourceForm: "Lodz",
    language: "pl",
    confidence: "low",
    sourceStatus: "structured-source"
  });
  const merged = mergeRemoteResult(fallback, remote);

  assert.equal(fallback.sourceStatus, "best-effort-fallback");
  assert.equal(fallback.confidence, "low");
  assert.equal(merged.id, "remote:lodz");
  assert.equal(merged.sourceStatus, "structured-source");
});
