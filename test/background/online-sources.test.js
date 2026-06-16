import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveTerm
} from "../../src/resolver-core.js";
import {
  onlineLookupLanguageHints,
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

function jsonResponse(payload) {
  return {
    ok: true,
    async json() {
      return payload;
    }
  };
}
