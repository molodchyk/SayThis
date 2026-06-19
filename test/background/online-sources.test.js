import assert from "node:assert/strict";
import test from "node:test";
import {
  createRemoteStructuredResult,
  getBestAudio,
  resolveTerm
} from "../../src/resolver-core.js";
import {
  onlineLookupLanguageHints,
  resolveWithForvoCandidates,
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
  assert.deepEqual(onlineLookupLanguageHints([], resolveTerm("Αθήνα", { entries: [] })), ["el"]);
  assert.deepEqual(onlineLookupLanguageHints([], resolveTerm("قطر", { entries: [] })), []);
});

test("uses clean script fallback language hints for Wiktionary editions", async () => {
  const originalFetch = globalThis.fetch;
  const localResult = resolveTerm("Αθήνα", { entries: [] });
  const requestedEditions = [];

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      if (parsed.host === "www.wikidata.org") {
        return jsonResponse({ search: [] });
      }

      if (parsed.host.endsWith(".wiktionary.org")) {
        const sourceLanguage = parsed.host.split(".")[0];
        requestedEditions.push(sourceLanguage);
        return jsonResponse({
          query: {
            pages: sourceLanguage === "el"
              ? [{
                title: "Αθήνα",
                revisions: [{
                  slots: {
                    main: {
                      content: "==Greek==\n===Pronunciation===\n* {{IPA|el|/aˈθina/}}"
                    }
                  }
                }]
              }]
              : [{ missing: true }]
          }
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await resolveWithOnlineSources("Αθήνα", {}, {}, {
      localResult
    });

    assert.deepEqual(requestedEditions, ["el", "en"]);
    assert.equal(result.language, "el");
    assert.equal(result.pronunciation.ipa, "/aˈθina/");
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("does not promote mismatched Forvo payload audio", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => jsonResponse({
      items: [{
        id: 1,
        word: "chiaroscuro",
        code: "en",
        langname: "English",
        pathogg: "https://audio.example/chiaroscuro-en.ogg",
        rate: 5
      }]
    });

    const result = await resolveWithForvoCandidates("bright-dark", {
      display: "bright-dark",
      sourceForm: "chiaroscuro",
      language: "it",
      sourceStatus: "structured-source"
    }, "api-key");

    assert.equal(result, null);
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

test("ignores legacy direct generator settings during online lookup", async () => {
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
  const requestedHosts = [];

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      requestedHosts.push(parsed.host);

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
        return jsonResponse({
          query: {
            pages: {}
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

    assert.equal(result, null);
    assert.ok(requestedHosts.includes("commons.wikimedia.org"));
    assert.equal(requestedHosts.includes("voice.example"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses Commons audio while ignoring legacy direct generator settings", async () => {
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

test("uses Commons audio before cached generated context audio", async () => {
  const originalFetch = globalThis.fetch;
  const generated = createRemoteStructuredResult("Exampletown", {
    id: "voice:exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        url: "https://voice.example/przykladowo.ogg",
        label: "Voice service",
        source: "Voice service",
        quality: "generated"
      }]
    },
    evidence: ["Generated voice"]
  });
  const searches = [];

  try {
    globalThis.fetch = async (url) => {
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
        searches.push(parsed.searchParams.get("gsrsearch"));
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

    const result = await resolveWithOnlineSources("Exampletown", {}, {}, {
      localResult: generated
    });

    assert.ok(searches.includes("filetype:audio Przykladowo"));
    assert.equal(result.sourceStatus, "verified-audio");
    assert.equal(result.pronunciation.audio[0].quality, "verified");
    assert.equal(result.pronunciation.audio.some((item) => item.quality === "generated"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checks Commons audio when dictionary audio is only generic verified quality", async () => {
  const originalFetch = globalThis.fetch;
  const searches = [];

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);

      if (parsed.host === "www.wikidata.org") {
        return jsonResponse({ search: [] });
      }

      if (parsed.host.endsWith(".wiktionary.org")) {
        return jsonResponse({
          query: {
            pages: [{
              title: "Displaytown",
              revisions: [{
                slots: {
                  main: {
                    content: `
==English==
===Pronunciation===
* {{IPA|en|/displaytown/}}
* {{audio|en|En-us-Displaytown.ogg|Audio}}
`
                  }
                }
              }]
            }]
          }
        });
      }

      if (parsed.host === "commons.wikimedia.org") {
        searches.push(parsed.searchParams.get("gsrsearch"));
        return jsonResponse({
          query: {
            pages: {
              1: {
                index: 1,
                title: "File:En-us-Displaytown_pronunciation_(Voice_of_America).ogg",
                imageinfo: [{
                  url: "https://upload.wikimedia.org/wikipedia/commons/d/d1/En-us-Displaytown_pronunciation_%28Voice_of_America%29.ogg",
                  descriptionurl: "https://commons.wikimedia.org/wiki/File:En-us-Displaytown_pronunciation_(Voice_of_America).ogg",
                  mime: "audio/ogg",
                  mediatype: "AUDIO",
                  extmetadata: {
                    ObjectName: { value: "En-us-Displaytown pronunciation" },
                    ImageDescription: { value: "Voice of America pronunciation of Displaytown" }
                  }
                }]
              }
            }
          }
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await resolveWithOnlineSources("Displaytown");

    assert.ok(searches.includes("filetype:audio Displaytown"));
    assert.equal(getBestAudio(result).quality, "source-backed");
    assert.equal(getBestAudio(result).url, "https://upload.wikimedia.org/wikipedia/commons/d/d1/En-us-Displaytown_pronunciation_%28Voice_of_America%29.ogg");
    assert.deepEqual(result.pronunciation.audio.map((item) => item.quality), ["source-backed", "verified"]);
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
