import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWikidataResult,
  normalizeSearchLanguageHints,
  selectBestWikidataResult,
  wikidataSearchLanguages
} from "../../src/sources/wikidata-adapter.js";

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
  assert.deepEqual(result.variants, ["City of Athens", "Athenae"]);
  assert.equal(result.language, "el");
  assert.equal(result.confidence, "medium");
  assert.ok(result.evidence.some((item) => item.includes("native label")));
  assert.ok(result.evidence.includes("Wikidata source-form variants: 2"));
});

test("uses native name claims as source-form candidates", () => {
  const result = buildWikidataResult("Miyazaki", {
    id: "Q1",
    label: "Hayao Miyazaki",
    language: "en",
    description: "film director"
  }, {
    id: "Q1",
    labels: {
      en: { language: "en", value: "Hayao Miyazaki" }
    },
    descriptions: {
      en: { language: "en", value: "film director" }
    },
    claims: {
      P1559: [{
        mainsnak: {
          datavalue: {
            value: { language: "ja", text: "宮崎駿" }
          }
        }
      }],
      P1477: [{
        mainsnak: {
          datavalue: {
            value: { language: "en", text: "Miyazaki Hayao" }
          }
        }
      }]
    },
    aliases: {}
  });

  assert.equal(result.sourceForm, "宮崎駿");
  assert.equal(result.language, "ja");
  assert.equal(result.confidence, "medium");
  assert.ok(result.aliases.includes("Miyazaki Hayao"));
  assert.ok(result.evidence.some((item) => item.includes("native name")));
});

test("uses native sitelink titles when name claims are sparse", () => {
  const result = buildWikidataResult("Miyazaki", {
    id: "Q2",
    label: "Miyazaki",
    language: "en",
    description: "film director"
  }, {
    id: "Q2",
    labels: {
      en: { language: "en", value: "Miyazaki" }
    },
    descriptions: {
      en: { language: "en", value: "film director" }
    },
    claims: {},
    aliases: {},
    sitelinks: {
      enwiki: { site: "enwiki", title: "Hayao_Miyazaki" },
      jawiki: { site: "jawiki", title: "宮崎駿" }
    }
  });

  assert.equal(result.sourceForm, "宮崎駿");
  assert.equal(result.language, "ja");
  assert.equal(result.confidence, "medium");
  assert.ok(result.aliases.includes("Hayao Miyazaki"));
  assert.ok(result.evidence.some((item) => item.includes("sitelink title")));
});

test("uses native aliases as source-form candidates", () => {
  const result = buildWikidataResult("Miyazaki", {
    id: "Q5",
    label: "Miyazaki",
    language: "en",
    description: "family name"
  }, {
    id: "Q5",
    labels: {
      en: { language: "en", value: "Miyazaki" }
    },
    descriptions: {
      en: { language: "en", value: "family name" }
    },
    claims: {},
    aliases: {
      ja: [{ language: "ja", value: "宮崎" }],
      en: [{ language: "en", value: "Miyazaki surname" }]
    }
  });

  assert.equal(result.sourceForm, "宮崎");
  assert.equal(result.language, "ja");
  assert.equal(result.confidence, "medium");
  assert.deepEqual(result.aliases, ["Miyazaki surname"]);
  assert.ok(result.evidence.some((item) => item.includes("alias")));
});

test("uses translated title claims as source-form candidates", () => {
  const result = buildWikidataResult("Totoro", {
    id: "Q3",
    label: "My Neighbor Totoro",
    language: "en",
    description: "animated film"
  }, {
    id: "Q3",
    labels: {
      en: { language: "en", value: "My Neighbor Totoro" }
    },
    descriptions: {
      en: { language: "en", value: "animated film" }
    },
    claims: {
      P1476: [{
        mainsnak: {
          datavalue: {
            value: { language: "ja", text: "となりのトトロ" }
          }
        }
      }]
    },
    aliases: {}
  });

  assert.equal(result.sourceForm, "となりのトトロ");
  assert.equal(result.language, "ja");
  assert.equal(result.confidence, "medium");
  assert.ok(result.evidence.some((item) => item.includes("title")));
});

test("uses lookup language hints when source forms compete", () => {
  const result = buildWikidataResult("Exampletown", {
    id: "Qhint",
    label: "Exampletown",
    language: "en",
    description: "settlement"
  }, {
    id: "Qhint",
    labels: {
      en: { language: "en", value: "Exampletown" }
    },
    descriptions: {
      en: { language: "en", value: "settlement" }
    },
    claims: {
      P1705: [{
        mainsnak: {
          datavalue: {
            value: { language: "de", text: "Beispielstadt" }
          }
        }
      }, {
        mainsnak: {
          datavalue: {
            value: { language: "pl", text: "Przyklad" }
          }
        }
      }]
    },
    aliases: {}
  }, {
    languageHints: ["pl"]
  });

  assert.equal(result.sourceForm, "Przyklad");
  assert.equal(result.language, "pl");
  assert.deepEqual(result.variants, ["Beispielstadt"]);
  assert.ok(result.evidence.includes("Source form matched lookup language hint: pl"));
});

test("uses exact romanized Cyrillic source form before conflicting native labels", () => {
  const result = buildWikidataResult("Pochetne", {
    id: "Qromanized",
    label: "Pochetne",
    language: "en",
    description: "settlement"
  }, {
    id: "Qromanized",
    labels: {
      en: { language: "en", value: "Pochetne" },
      ru: { language: "ru", value: "Почётное" },
      uk: { language: "uk", value: "Почетне" }
    },
    descriptions: {
      en: { language: "en", value: "settlement" }
    },
    claims: {
      P1705: [{
        mainsnak: {
          datavalue: {
            value: { language: "ru", text: "Почётное" }
          }
        }
      }]
    },
    aliases: {}
  });

  assert.equal(result.sourceForm, "Почетне");
  assert.equal(result.language, "uk");
  assert.deepEqual(result.variants, ["Почётное"]);
});

test("uses taxon names as source-form candidates", () => {
  const result = buildWikidataResult("yellow fever mosquito", {
    id: "Q4",
    label: "yellow fever mosquito",
    language: "en",
    description: "species of insect"
  }, {
    id: "Q4",
    labels: {
      en: { language: "en", value: "yellow fever mosquito" }
    },
    descriptions: {
      en: { language: "en", value: "species of insect" }
    },
    claims: {
      P225: [{
        mainsnak: {
          datavalue: {
            value: "Aedes aegypti"
          }
        }
      }],
      P1843: [{
        mainsnak: {
          datavalue: {
            value: { language: "en", text: "yellow fever mosquito" }
          }
        }
      }]
    },
    aliases: {}
  });

  assert.equal(result.sourceForm, "Aedes aegypti");
  assert.equal(result.language, "la");
  assert.equal(result.languageName, "Latin");
  assert.ok(result.evidence.some((item) => item.includes("taxon name")));
});

test("uses entity type claims for category evidence", () => {
  const result = buildWikidataResult("Springfield", {
    id: "Qplace",
    label: "Springfield",
    language: "en",
    description: "settlement"
  }, {
    id: "Qplace",
    labels: {
      en: { language: "en", value: "Springfield" }
    },
    descriptions: {
      en: { language: "en", value: "settlement" }
    },
    claims: {
      P31: [{
        mainsnak: {
          datavalue: {
            value: { id: "Q515", "numeric-id": 515 }
          }
        }
      }]
    },
    aliases: {}
  });

  assert.equal(result.category, "place");
  assert.ok(result.evidence.includes("Entity type: city"));
});

test("uses broader entity type claims and filters category pages", () => {
  for (const [query, id, type, category, label] of [
    ["Dijkstra", "Qalgorithm", "Q8366", "technical term", "algorithm"],
    ["amyloid beta", "Qprotein", "Q8054", "scientific term", "protein"],
    ["topology", "Qmath", "Q1936384", "academic term", "branch of mathematics"],
    ["flu", "Qdisease", "Q12136", "medical term", "disease"]
  ]) {
    const result = buildWikidataResult(query, typedMatch(id, query, category), typedEntity(id, query, category, type));
    assert.equal(result.category, category);
    assert.ok(result.evidence.includes(`Entity type: ${label}`));
  }

  const result = selectBestWikidataResult("Mori", [
    typedMatch("Qcategory", "Mori", "Wikimedia category page"),
    typedMatch("Qfamily", "Mori", "family name")
  ], {
    Qcategory: typedEntity("Qcategory", "Mori", "Wikimedia category page", "Q4167836"),
    Qfamily: typedEntity("Qfamily", "Mori", "family name", "Q101352")
  });
  assert.equal(result.id, "wikidata:Qfamily");
  assert.equal(result.category, "name");
  assert.ok(result.evidence.includes("Entity type: family name"));
  assert.equal(result.alternateResults, undefined);
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
  assert.equal(result.alternateResults, undefined);
});

test("preserves useful Wikidata alternates after selecting the strongest candidate", () => {
  const matches = [{
    id: "Qaudio",
    label: "Aten",
    language: "en",
    description: "ancient Egyptian deity",
    match: { text: "Aten" }
  }, {
    id: "Qsite",
    label: "Aten",
    language: "en",
    description: "archaeological site",
    match: { text: "Aten" }
  }];
  const result = selectBestWikidataResult("Aten", matches, {
    Qaudio: {
      id: "Qaudio",
      labels: {
        en: { language: "en", value: "Aten" }
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
    },
    Qsite: {
      id: "Qsite",
      labels: {
        en: { language: "en", value: "Aten" }
      },
      descriptions: {
        en: { language: "en", value: "archaeological site" }
      },
      claims: {
        P1448: [{
          mainsnak: {
            datavalue: {
              value: { language: "en", text: "Aten site" }
            }
          }
        }]
      },
      aliases: {}
    }
  });

  assert.equal(result.id, "wikidata:Qaudio");
  assert.equal(result.alternateResults.length, 1);
  assert.equal(result.alternateResults[0].id, "wikidata:Qsite");
  assert.equal(result.alternateResults[0].sourceForm, "Aten site");
  assert.equal(result.alternateResults[0].language, "en");
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

test("uses entity type claims to deprioritize disambiguation candidates", () => {
  const result = selectBestWikidataResult("Springfield", [
    typedMatch("Qfirst", "Springfield", "index entry"),
    typedMatch("Qplace", "Springfield", "settlement")
  ], {
    Qfirst: typedEntity("Qfirst", "Springfield", "index entry", "Q4167410"),
    Qplace: typedEntity("Qplace", "Springfield", "settlement", "Q515")
  });

  assert.equal(result.id, "wikidata:Qplace");
  assert.equal(result.category, "place");
  assert.ok(result.evidence.includes("Entity type: city"));

  const sparseResult = selectBestWikidataResult("Prometheus", [
    typedMatch("Qindex", "Prometheus", "index entry"),
    typedMatch("Qalgorithm", "Prometheus", "algorithm in computer science")
  ], {
    Qindex: typedEntity("Qindex", "Prometheus", "index entry"),
    Qalgorithm: typedEntity("Qalgorithm", "Prometheus", "algorithm in computer science")
  });

  assert.equal(sparseResult.id, "wikidata:Qalgorithm");
  assert.equal(sparseResult.category, "algorithm in computer science");
});

test("plans bounded Wikidata search languages from selected script", () => {
  assert.deepEqual(wikidataSearchLanguages("Athens"), ["en"]);
  assert.deepEqual(wikidataSearchLanguages("Αθήνα"), ["en", "el"]);
  assert.deepEqual(wikidataSearchLanguages("Москва"), ["en", "ru", "bg", "sr", "uk"]);
  assert.deepEqual(wikidataSearchLanguages("東京"), ["en", "zh", "ja", "ko"]);
  assert.deepEqual(wikidataSearchLanguages("Athens", {
    languageHints: "pl, tr, pt-BR, pl, invalid!"
  }), ["en", "pl", "tr", "pt"]);
  assert.deepEqual(wikidataSearchLanguages("Москва", {
    languageHints: ["pl", "ru", "tr", "ja", "ko", "pt", "ro", "it"]
  }), ["en", "ru", "bg", "sr", "uk", "pl", "tr", "ja"]);
  assert.deepEqual(normalizeSearchLanguageHints([" PT_BR ", "bad!", "tr", "pt"]), ["pt", "tr"]);
});

function typedMatch(id, label, description) {
  return { id, label, language: "en", description, match: { text: label } };
}

function typedEntity(id, label, description, type = "") {
  const language = "en";
  const claims = type ? { P31: [{ mainsnak: { datavalue: { value: { id: type } } } }] } : {};
  return { id, labels: { en: { language, value: label } }, descriptions: { en: { language, value: description } }, claims, aliases: {} };
}
