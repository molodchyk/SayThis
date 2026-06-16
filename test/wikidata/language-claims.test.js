import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWikidataResult
} from "../../src/wikidata-adapter.js";

test("uses entity language claims when source-form language is unresolved", () => {
  const result = buildWikidataResult("Exampletitle", {
    id: "Qlang",
    label: "Exampletitle",
    language: "en",
    description: "creative title"
  }, {
    id: "Qlang",
    labels: {
      en: { language: "en", value: "Exampletitle" }
    },
    descriptions: {
      en: { language: "en", value: "creative title" }
    },
    claims: {
      P407: [{
        mainsnak: {
          datavalue: {
            value: { id: "Q809", "numeric-id": 809 }
          }
        }
      }]
    },
    aliases: {}
  });

  assert.equal(result.sourceForm, "Exampletitle");
  assert.equal(result.language, "pl");
  assert.equal(result.ttsLang, "pl-PL");
  assert.ok(result.evidence.includes("Language from language of name: pl"));
});

test("uses lookup hints to select among entity language claims", () => {
  const result = buildWikidataResult("Exampletitle", {
    id: "Qclaimhint",
    label: "Exampletitle",
    language: "en",
    description: "creative title"
  }, {
    id: "Qclaimhint",
    labels: {
      en: { language: "en", value: "Exampletitle" }
    },
    descriptions: {
      en: { language: "en", value: "creative title" }
    },
    claims: {
      P407: [{
        mainsnak: {
          datavalue: {
            value: { id: "Q188", "numeric-id": 188 }
          }
        }
      }, {
        mainsnak: {
          datavalue: {
            value: { id: "Q809", "numeric-id": 809 }
          }
        }
      }]
    },
    aliases: {}
  }, {
    languageHints: ["pl"]
  });

  assert.equal(result.language, "pl");
  assert.ok(result.evidence.includes("Language from language of name: pl"));
});

test("keeps native source-form language over entity language claims", () => {
  const result = buildWikidataResult("Exampleperson", {
    id: "Qnative",
    label: "Exampleperson",
    language: "en",
    description: "person"
  }, {
    id: "Qnative",
    labels: {
      en: { language: "en", value: "Exampleperson" },
      ja: { language: "ja", value: "例人" }
    },
    descriptions: {
      en: { language: "en", value: "person" }
    },
    claims: {
      P1705: [{
        mainsnak: {
          datavalue: {
            value: { language: "ja", text: "例人" }
          }
        }
      }],
      P407: [{
        mainsnak: {
          datavalue: {
            value: { id: "Q1860", "numeric-id": 1860 }
          }
        }
      }]
    },
    aliases: {}
  });

  assert.equal(result.sourceForm, "例人");
  assert.equal(result.language, "ja");
  assert.equal(result.evidence.some((item) => item.startsWith("Language from")), false);
});

test("uses country language hints when direct language claims are absent", () => {
  const result = buildWikidataResult("Exampleplace", {
    id: "Qcountryhint",
    label: "Exampleplace",
    language: "en",
    description: "settlement"
  }, {
    id: "Qcountryhint",
    labels: {
      en: { language: "en", value: "Exampleplace" }
    },
    descriptions: {
      en: { language: "en", value: "settlement" }
    },
    claims: {
      P17: [{
        mainsnak: {
          datavalue: {
            value: { id: "Q36", "numeric-id": 36 }
          }
        }
      }]
    },
    aliases: {}
  });

  assert.equal(result.language, "pl");
  assert.ok(result.evidence.includes("Language from country language hint: pl"));
});
