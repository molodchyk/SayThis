import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWikidataResult,
  selectBestWikidataResult
} from "../../src/sources/wikidata-adapter.js";

test("uses domain claims to rank generic concept candidates", () => {
  const result = buildWikidataResult("Homology", {
    id: "Qdomain",
    label: "Homology",
    language: "en",
    description: "concept"
  }, typedEntity("Qdomain", "Homology", "concept", {
    P31: [entityClaim("Q1969448")],
    P101: [entityClaim("Q395")]
  }));

  assert.equal(result.category, "academic term");
  assert.ok(result.evidence.includes("Entity signal from field of work: mathematics"));

  const ranked = selectBestWikidataResult("Homology", [
    typedMatch("Qgeneric", "Homology", "concept"),
    typedMatch("Qdomain", "Homology", "concept")
  ], {
    Qgeneric: typedEntity("Qgeneric", "Homology", "concept", {
      P31: [entityClaim("Q1969448")]
    }),
    Qdomain: typedEntity("Qdomain", "Homology", "concept", {
      P31: [entityClaim("Q1969448")],
      P101: [entityClaim("Q395")]
    })
  });

  assert.equal(ranked.id, "wikidata:Qdomain");
  assert.equal(ranked.category, "academic term");
});

function typedMatch(id, label, description) {
  return { id, label, language: "en", description, match: { text: label } };
}

function typedEntity(id, label, description, claims = {}) {
  const language = "en";
  return { id, labels: { en: { language, value: label } }, descriptions: { en: { language, value: description } }, claims, aliases: {} };
}

function entityClaim(id) {
  return {
    mainsnak: {
      datavalue: {
        value: { id }
      }
    }
  };
}
