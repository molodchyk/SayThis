import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveTerm
} from "../../src/resolver-core.js";
import {
  onlineLookupLanguageHints,
  resolveWithWikidata,
  resolveWithOnlineSources
} from "../../src/background/online-sources.js";

test("adds local fallback language to online lookup hints", () => {
  assert.deepEqual(onlineLookupLanguageHints(["tr", "pl"], {
    language: "pl",
    sourceStatus: "best-effort-fallback"
  }), ["tr", "pl"]);
  assert.deepEqual(onlineLookupLanguageHints("tr, invalid!", {
    language: "pl",
    sourceStatus: "best-effort-fallback"
  }), ["tr", "pl"]);
  assert.deepEqual(onlineLookupLanguageHints([], {
    language: "pl",
    sourceStatus: "structured-source"
  }), []);
});

test("uses local fallback language hints for Forvo lookup candidates", async () => {
  const originalFetch = globalThis.fetch;
  const localResult = resolveTerm("Łódź", { entries: [] });
  const requestedUrls = [];

  try {
    globalThis.fetch = async (url) => {
      requestedUrls.push(String(url));
      const parsed = new URL(url);

      if (parsed.host === "www.wikidata.org") {
        return jsonResponse({ search: [] });
      }

      if (parsed.host.endsWith(".wiktionary.org")) {
        return jsonResponse({
          query: {
            pages: [{ missing: true }]
          }
        });
      }

      if (parsed.host === "apifree.forvo.com") {
        return jsonResponse({
          items: [{
            id: 77,
            word: "Łódź",
            code: "pl",
            langname: "Polish",
            pathogg: "https://audio.example/lodz.ogg",
            rate: 5
          }]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await resolveWithOnlineSources("Łódź", {
      forvoEnabled: true
    }, {
      forvoApiKey: "api-key"
    }, {
      localResult
    });

    assert.ok(requestedUrls.some((url) => url.includes("language=pl") || url.includes("language%3Dpl")));
    assert.ok(requestedUrls.some((url) => url.includes("/language/pl")));
    assert.equal(result.language, "pl");
    assert.equal(result.sourceStatus, "verified-audio");
    assert.equal(result.pronunciation.audio[0].url, "https://audio.example/lodz.ogg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tries transliterated Wikidata lookup candidates", async () => {
  const originalFetch = globalThis.fetch;
  const requestedSearches = [];

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);

      if (parsed.host === "www.wikidata.org" && parsed.pathname === "/w/api.php") {
        requestedSearches.push({
          search: parsed.searchParams.get("search"),
          language: parsed.searchParams.get("language")
        });
        return jsonResponse({
          search: parsed.searchParams.get("search") === "Москва" && parsed.searchParams.get("language") === "ru"
            ? [{
              id: "Qmoskva",
              label: "Москва",
              language: "ru",
              description: "capital city",
              match: { text: "Москва" }
            }]
            : []
        });
      }

      if (parsed.host === "www.wikidata.org" && parsed.pathname.includes("/wiki/Special:EntityData/")) {
        return jsonResponse({
          entities: {
            Qmoskva: {
              id: "Qmoskva",
              labels: {
                en: { language: "en", value: "Moscow" },
                ru: { language: "ru", value: "Москва" }
              },
              descriptions: {
                en: { language: "en", value: "capital city" }
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
              aliases: {
                en: [{ language: "en", value: "Moskva" }]
              }
            }
          }
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await resolveWithWikidata("Moskva", {
      languageHints: ["ru"]
    });

    assert.ok(requestedSearches.some((item) => item.search === "Москва" && item.language === "ru"));
    assert.equal(result.sourceForm, "Москва");
    assert.equal(result.language, "ru");
    assert.equal(result.category, "place");
    assert.ok(result.aliases.includes("Moskva"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tries bounded suffix transliteration candidates without explicit hints", async () => {
  const originalFetch = globalThis.fetch;
  const requestedSearches = [];

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);

      if (parsed.host === "www.wikidata.org" && parsed.pathname === "/w/api.php") {
        requestedSearches.push({
          search: parsed.searchParams.get("search"),
          language: parsed.searchParams.get("language")
        });
        return jsonResponse({
          search: parsed.searchParams.get("search") === "Калинине"
            ? [{
              id: "Qkalynyne",
              label: "Калинине",
              language: "uk",
              description: "settlement",
              match: { text: "Калинине" }
            }]
            : []
        });
      }

      if (parsed.host === "www.wikidata.org" && parsed.pathname.includes("/wiki/Special:EntityData/")) {
        return jsonResponse({
          entities: {
            Qkalynyne: {
              id: "Qkalynyne",
              labels: {
                en: { language: "en", value: "Kalynyne" },
                uk: { language: "uk", value: "Калинине" }
              },
              descriptions: {
                en: { language: "en", value: "settlement" }
              },
              claims: {
                P31: [{
                  mainsnak: {
                    datavalue: {
                      value: { id: "Q486972", "numeric-id": 486972 }
                    }
                  }
                }]
              },
              aliases: {}
            }
          }
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await resolveWithWikidata("Kalynyne");

    assert.ok(requestedSearches.some((item) => item.search === "Калинине" && item.language === "uk"));
    assert.equal(result.sourceForm, "Калинине");
    assert.equal(result.language, "uk");
    assert.equal(result.category, "place");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(payload) {
  return {
    ok: true,
    async json() {
      return payload;
    }
  };
}
