import assert from "node:assert/strict";
import test from "node:test";
import {
  createRemoteStructuredResult,
  resolveTerm
} from "../../src/resolver-core.js";
import {
  onlineLookupLanguageHints,
  resolveWithCustomSourceCandidates,
  resolveWithWikidata,
  resolveWithOnlineSources,
  resolveWithVoiceService
} from "../../src/background/online-sources.js";
import {
  buildCommonsAudioSearchUrl,
  resolveWithCommonsAudioLookup
} from "../../src/background/sources/commons-audio-source.js";

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

test("retries custom source with resolved source-form candidates", async () => {
  const originalFetch = globalThis.fetch;
  const requestedQueries = [];

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      requestedQueries.push(parsed.searchParams.get("q"));
      assert.equal(parsed.origin, "https://packs.example");

      return jsonResponse(parsed.searchParams.get("q") === "chiaroscuro"
        ? {
          sourceName: "Art terms",
          entries: [{
            term: "chiaroscuro",
            sourceForm: "chiaroscuro",
            language: "it",
            simple: "kee-ah-roh-SKOO-roh"
          }]
        }
        : { entries: [] });
    };

    const result = await resolveWithCustomSourceCandidates("bright-dark", {
      display: "bright-dark",
      sourceForm: "chiaroscuro",
      language: "it",
      sourceStatus: "structured-source",
      confidence: "medium"
    }, "https://packs.example/search", "Art terms");

    assert.deepEqual(requestedQueries, ["chiaroscuro"]);
    assert.equal(result.query, "bright-dark");
    assert.equal(result.sourceForm, "chiaroscuro");
    assert.equal(result.pronunciation.simple, "kee-ah-roh-SKOO-roh");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("builds voice-service audio from resolved structured results", async () => {
  const structured = createRemoteStructuredResult("Exampletown", {
    id: "remote:exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    languageName: "Polish",
    ttsLang: "pl-PL",
    category: "place"
  });

  const result = resolveWithVoiceService("Exampletown", structured, {
    voiceServiceUrlTemplate: "https://voice.example/speak?text={sourceForm}&lang={lang}",
    voiceServiceLabel: "Example voice"
  });

  assert.equal(result.sourceStatus, "generated-audio");
  assert.equal(result.sourceForm, "Przykladowo");
  assert.equal(result.pronunciation.audio[0].url, "https://voice.example/speak?text=Przykladowo&lang=pl-PL");
});

test("does not build voice-service audio when a recording exists", async () => {
  const recorded = createRemoteStructuredResult("Exampletown", {
    id: "remote:recorded",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    pronunciation: {
      audio: [{ url: "https://audio.example/przykladowo.ogg" }]
    }
  });

  assert.equal(resolveWithVoiceService("Exampletown", recorded, {
    voiceServiceUrlTemplate: "https://voice.example/speak?text={sourceForm}&lang={lang}"
  }), null);
});

test("uses Commons audio before generated voice-service audio", async () => {
  const originalFetch = globalThis.fetch;
  const structured = createRemoteStructuredResult("Exampletown", {
    id: "remote:exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    languageName: "Polish",
    ttsLang: "pl-PL",
    category: "place"
  });
  const requestedUrls = [];
  const requestedHeaders = [];

  try {
    globalThis.fetch = async (url, options = {}) => {
      requestedUrls.push(String(url));
      requestedHeaders.push(options.headers || {});
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

      if (parsed.host === "commons.wikimedia.org") {
        assert.equal(parsed.searchParams.get("generator"), "search");
        assert.equal(parsed.searchParams.get("gsrnamespace"), "6");
        assert.equal(parsed.searchParams.get("gsrsearch"), "filetype:audio Przykladowo");
        return jsonResponse({
          query: {
            pages: {
              1: {
                index: 1,
                title: "File:Pl-Przykladowo.ogg",
                imageinfo: [{
                  url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Pl-Przykladowo.ogg",
                  descriptionurl: "https://commons.wikimedia.org/wiki/File:Pl-Przykladowo.ogg",
                  mime: "audio/ogg",
                  mediatype: "AUDIO",
                  extmetadata: {
                    ObjectName: { value: "Pl-Przykladowo.ogg" }
                  }
                }]
              }
            }
          }
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await resolveWithOnlineSources("Exampletown", {
      voiceServiceEnabled: true,
      voiceServiceUrlTemplate: "https://voice.example/speak?text={sourceForm}&lang={lang}"
    }, {}, {
      localResult: structured
    });

    assert.ok(requestedUrls.some((url) => url.startsWith("https://commons.wikimedia.org/w/api.php?")));
    assert.ok(requestedHeaders.some((headers) => headers["Api-User-Agent"]?.startsWith("SayThis/")));
    assert.equal(result.sourceStatus, "verified-audio");
    assert.equal(result.sourceForm, "Przykladowo");
    assert.equal(result.pronunciation.audio[0].source, "Wikimedia Commons");
    assert.equal(result.pronunciation.audio[0].url, "https://upload.wikimedia.org/wikipedia/commons/a/a1/Pl-Przykladowo.ogg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("builds Commons audio search URLs for file namespace lookup", () => {
  const url = new URL(buildCommonsAudioSearchUrl("Przykladowo"));

  assert.equal(url.origin, "https://commons.wikimedia.org");
  assert.equal(url.pathname, "/w/api.php");
  assert.equal(url.searchParams.get("generator"), "search");
  assert.equal(url.searchParams.get("gsrsearch"), "filetype:audio Przykladowo");
  assert.equal(url.searchParams.get("gsrnamespace"), "6");
  assert.equal(url.searchParams.get("prop"), "imageinfo");
  assert.equal(url.searchParams.get("iiprop"), "url|mime|mediatype|extmetadata");
});

test("falls back to broad Commons search when audio-constrained search misses", async () => {
  const originalFetch = globalThis.fetch;
  const searches = [];

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      searches.push(parsed.searchParams.get("gsrsearch"));
      return jsonResponse(searches.length === 1
        ? { query: { pages: {} } }
        : {
          query: {
            pages: {
              1: {
                index: 1,
                title: "File:Exampletown.ogg",
                imageinfo: [{
                  url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Exampletown.ogg",
                  descriptionurl: "https://commons.wikimedia.org/wiki/File:Exampletown.ogg",
                  mime: "audio/ogg",
                  mediatype: "AUDIO",
                  extmetadata: {
                    ObjectName: { value: "Exampletown.ogg" }
                  }
                }]
              }
            }
          }
        });
    };

    const result = await resolveWithCommonsAudioLookup("Exampletown", "Exampletown", "en");

    assert.deepEqual(searches, ["filetype:audio Exampletown", "Exampletown"]);
    assert.equal(result.sourceStatus, "verified-audio");
    assert.equal(result.pronunciation.audio[0].url, "https://upload.wikimedia.org/wikipedia/commons/a/a1/Exampletown.ogg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("prefers Commons recordings that match the resolved language", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => jsonResponse({
      query: {
        pages: {
          1: {
            index: 1,
            title: "File:En-us-Gnocchi.ogg",
            imageinfo: [{
              url: "https://upload.wikimedia.org/wikipedia/commons/e/e1/En-us-Gnocchi.ogg",
              descriptionurl: "https://commons.wikimedia.org/wiki/File:En-us-Gnocchi.ogg",
              mime: "audio/ogg",
              mediatype: "AUDIO",
              extmetadata: {
                ObjectName: { value: "En-us-Gnocchi.ogg" }
              }
            }]
          },
          2: {
            index: 2,
            title: "File:It-Gnocchi.oga",
            imageinfo: [{
              url: "https://upload.wikimedia.org/wikipedia/commons/i/i1/It-Gnocchi.oga",
              descriptionurl: "https://commons.wikimedia.org/wiki/File:It-Gnocchi.oga",
              mime: "audio/ogg",
              mediatype: "AUDIO",
              extmetadata: {
                ObjectName: { value: "It-Gnocchi.oga" }
              }
            }]
          }
        }
      }
    });

    const result = await resolveWithCommonsAudioLookup("gnocchi", "gnocchi", "it");

    assert.equal(result.sourceStatus, "verified-audio");
    assert.equal(result.pronunciation.audio[0].url, "https://upload.wikimedia.org/wikipedia/commons/i/i1/It-Gnocchi.oga");
    assert.equal(result.sources[0].url, "https://commons.wikimedia.org/wiki/File:It-Gnocchi.oga");
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
