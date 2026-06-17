import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDbpediaLookupUrl,
  buildDbpediaResult
} from "../../src/background/dbpedia-source.js";
import {
  resolveWithDbpedia,
  resolveWithDbpediaCandidates
} from "../../src/background/online-sources.js";

test("builds a DBpedia-compatible lookup URL", () => {
  const url = new URL(buildDbpediaLookupUrl(" Chiaroscuro ", "https://lookup.example/api/search?class=Thing", {
    limit: 30
  }));

  assert.equal(url.origin, "https://lookup.example");
  assert.equal(url.pathname, "/api/search");
  assert.equal(url.searchParams.get("class"), "Thing");
  assert.equal(url.searchParams.get("query"), "Chiaroscuro");
  assert.equal(url.searchParams.get("format"), "json");
  assert.equal(url.searchParams.get("maxResults"), "20");
  assert.equal(buildDbpediaLookupUrl("term", "http://lookup.example/search"), "");
});

test("builds a structured DBpedia result from lookup docs", () => {
  const result = buildDbpediaResult("light-dark", {
    docs: [{
      Label: ["Chiaroscuro"],
      URI: ["http://dbpedia.org/resource/Chiaroscuro"],
      Description: ["Painting technique using strong contrast between light and dark."],
      Classes: ["http://dbpedia.org/ontology/Artwork"],
      Categories: ["http://dbpedia.org/resource/Category:Art_techniques"],
      redirectlabel: ["Chiaro scuro", "Clair-obscur"]
    }]
  });

  assert.equal(result.id, "dbpedia:https://dbpedia.org/resource/chiaroscuro");
  assert.equal(result.sourceForm, "Chiaroscuro");
  assert.equal(result.category, "Artwork");
  assert.equal(result.domainHint, "Artwork");
  assert.equal(result.language, "en");
  assert.equal(result.sourceStatus, "structured-source");
  assert.deepEqual(result.aliases, ["light-dark"]);
  assert.deepEqual(result.variants, ["Chiaro scuro", "Clair-obscur"]);
  assert.equal(result.sources[0].url, "https://dbpedia.org/resource/Chiaroscuro");
  assert.ok(result.evidence.includes("Structured result from DBpedia"));
  assert.ok(result.evidence.includes("DBpedia variants: 2"));
});

test("uses DBpedia redirect labels for candidate scoring", () => {
  const result = buildDbpediaResult("light-dark technique", {
    docs: [{
      Label: ["Unrelated entry"],
      URI: ["http://dbpedia.org/resource/Unrelated_entry"],
      Description: ["Different topic."]
    }, {
      Label: ["Chiaroscuro"],
      URI: ["http://dbpedia.org/resource/Chiaroscuro"],
      Description: ["Painting technique using strong contrast."],
      redirectlabel: ["light-dark technique", "chiaro scuro"]
    }]
  });

  assert.equal(result.sourceForm, "Chiaroscuro");
  assert.deepEqual(result.variants, ["chiaro scuro"]);
});

test("resolves DBpedia lookup data and retries source-form candidates", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];

  try {
    globalThis.fetch = async (url) => {
      requested.push(new URL(url).searchParams.get("query"));
      return {
        ok: true,
        async json() {
          const query = new URL(url).searchParams.get("query");
          return {
            docs: [{
              Label: [query === "Chiaroscuro" ? "Chiaroscuro" : "Chiaroscuro technique"],
              URI: [`http://dbpedia.org/resource/${query.replace(/\s+/g, "_")}`],
              Description: ["Structured knowledge graph match."],
              Classes: ["http://dbpedia.org/ontology/Artwork"]
            }]
          };
        }
      };
    };

    const result = await resolveWithDbpedia("Chiaroscuro", "https://lookup.example/search");
    const retried = await resolveWithDbpediaCandidates("light-dark", {
      sourceForm: "Chiaroscuro",
      language: "en"
    }, "https://lookup.example/search");

    assert.equal(result.sourceForm, "Chiaroscuro");
    assert.equal(retried.sourceForm, "Chiaroscuro");
    assert.deepEqual(requested, ["Chiaroscuro", "Chiaroscuro"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
