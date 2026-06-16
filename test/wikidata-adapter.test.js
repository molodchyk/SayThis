import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWikidataResult,
  commonsRedirectUrl,
  selectBestWikidataResult,
  wikidataSearchLanguages
} from "../src/wikidata-adapter.js";

test("prefers native label claims over English labels", () => {
  const result = buildWikidataResult("Athens", {
    id: "Q1524",
    label: "Athens",
    language: "en",
    description: "capital city"
  }, {
    id: "Q1524",
    labels: {
      en: { language: "en", value: "Athens" },
      el: { language: "el", value: "Αθήνα" },
      la: { language: "la", value: "Athenae" }
    },
    descriptions: {
      en: { language: "en", value: "capital city of Greece" }
    },
    claims: {
      P1705: [{
        mainsnak: {
          datavalue: {
            value: { language: "el", text: "Αθήνα" }
          }
        }
      }],
      P1448: [{
        mainsnak: {
          datavalue: {
            value: { language: "en", text: "City of Athens" }
          }
        }
      }]
    },
    aliases: {}
  });

  assert.equal(result.sourceForm, "Αθήνα");
  assert.deepEqual(result.aliases, ["City of Athens", "Athenae"]);
  assert.equal(result.language, "el");
  assert.equal(result.confidence, "medium");
  assert.ok(result.evidence.some((item) => item.includes("native label")));
});

test("extracts pronunciation audio and IPA claims", () => {
  const result = buildWikidataResult("Example", {
    id: "Q1",
    label: "Example",
    language: "en"
  }, {
    id: "Q1",
    labels: {
      en: { language: "en", value: "Example" }
    },
    claims: {
      P443: [{
        mainsnak: {
          datavalue: {
            value: "Example pronunciation.ogg"
          }
        }
      }],
      P898: [{
        mainsnak: {
          datavalue: {
            value: "ɪɡˈzɑːmpəl"
          }
        }
      }]
    },
    aliases: {
      en: [{ language: "en", value: "Sample entry" }]
    }
  });

  assert.equal(result.sourceStatus, "verified-audio");
  assert.deepEqual(result.aliases, ["Sample entry"]);
  assert.equal(result.confidence, "high");
  assert.equal(result.pronunciation.ipa, "ɪɡˈzɑːmpəl");
  assert.equal(result.pronunciation.audio[0].url, commonsRedirectUrl("Example pronunciation.ogg"));
});

test("selects a later candidate when it has stronger pronunciation evidence", () => {
  const matches = [{
    id: "Qbad",
    label: "Aten",
    language: "en",
    description: "Wikimedia disambiguation page",
    match: { text: "Aten" }
  }, {
    id: "Qgood",
    label: "Aten",
    language: "en",
    description: "ancient Egyptian deity",
    match: { text: "Aten" }
  }];
  const result = selectBestWikidataResult("Aten", matches, {
    Qbad: {
      id: "Qbad",
      labels: {
        en: { language: "en", value: "Aten" }
      },
      descriptions: {
        en: { language: "en", value: "Wikimedia disambiguation page" }
      },
      claims: {},
      aliases: {}
    },
    Qgood: {
      id: "Qgood",
      labels: {
        en: { language: "en", value: "Aten" },
        egx: { language: "egx", value: "jtn" }
      },
      descriptions: {
        en: { language: "en", value: "ancient Egyptian deity" }
      },
      claims: {
        P443: [{
          mainsnak: {
            datavalue: {
              value: "Aten pronunciation.ogg"
            }
          }
        }]
      },
      aliases: {}
    }
  });

  assert.equal(result.id, "wikidata:Qgood");
  assert.equal(result.sourceStatus, "verified-audio");
  assert.ok(result.evidence.includes("Selected from 2 Wikidata candidates"));
});

test("uses alias matches to outrank weaker search order", () => {
  const matches = [{
    id: "Qfirst",
    label: "Similar",
    language: "en",
    description: "unrelated term",
    match: { text: "Similar" }
  }, {
    id: "Qalias",
    label: "Primary label",
    language: "en",
    description: "technical term",
    match: { text: "Primary label" }
  }];
  const result = selectBestWikidataResult("Exact Alias", matches, {
    Qfirst: {
      id: "Qfirst",
      labels: {
        en: { language: "en", value: "Similar" }
      },
      claims: {},
      aliases: {}
    },
    Qalias: {
      id: "Qalias",
      labels: {
        en: { language: "en", value: "Primary label" }
      },
      claims: {},
      aliases: {
        en: [{ language: "en", value: "Exact Alias" }]
      }
    }
  });

  assert.equal(result.id, "wikidata:Qalias");
  assert.ok(result.evidence.some((item) => item.includes("Exact Alias")));
});

test("plans bounded Wikidata search languages from selected script", () => {
  assert.deepEqual(wikidataSearchLanguages("Athens"), ["en"]);
  assert.deepEqual(wikidataSearchLanguages("Αθήνα"), ["en", "el"]);
  assert.deepEqual(wikidataSearchLanguages("Москва"), ["en", "ru", "bg", "sr"]);
  assert.deepEqual(wikidataSearchLanguages("東京"), ["en", "zh", "ja", "ko"]);
});
