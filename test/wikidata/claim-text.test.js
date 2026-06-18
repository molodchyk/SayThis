import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWikidataResult
} from "../../src/sources/wikidata-adapter.js";

test("uses string-valued name claims as source-form candidates", () => {
  const result = buildWikidataResult("University of Padua", {
    id: "QstringName",
    label: "University of Padua",
    language: "en",
    description: "public university"
  }, {
    id: "QstringName",
    labels: {
      en: { language: "en", value: "University of Padua" }
    },
    descriptions: {
      en: { language: "en", value: "public university in Italy" }
    },
    claims: {
      P1448: [{
        mainsnak: {
          datavalue: {
            value: "Università degli Studi di Padova"
          }
        }
      }],
      P17: [{
        mainsnak: {
          datavalue: {
            value: { id: "Q38", "numeric-id": 38 }
          }
        }
      }]
    },
    aliases: {
      en: [{ language: "en", value: "Padua University" }]
    }
  });

  assert.equal(result.sourceForm, "Università degli Studi di Padova");
  assert.equal(result.language, "it");
  assert.equal(result.confidence, "medium");
  assert.deepEqual(result.aliases, ["Padua University"]);
  assert.ok(result.evidence.some((item) => item.includes("official name")));
  assert.ok(result.evidence.includes("Language from country language hint: it"));
});
