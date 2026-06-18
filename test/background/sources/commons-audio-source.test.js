import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommonsAudioSearchUrl,
  resolveWithCommonsAudioLookup
} from "../../../src/background/sources/commons-audio-source.js";

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
                title: "File:En-us-Exampletown.ogg",
                imageinfo: [{
                  url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/En-us-Exampletown.ogg",
                  descriptionurl: "https://commons.wikimedia.org/wiki/File:En-us-Exampletown.ogg",
                  mime: "audio/ogg",
                  mediatype: "AUDIO",
                  extmetadata: {
                    ObjectName: { value: "En-us-Exampletown.ogg" }
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
    assert.equal(result.pronunciation.audio[0].url, "https://upload.wikimedia.org/wikipedia/commons/a/a1/En-us-Exampletown.ogg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects generic Commons audio without pronunciation evidence", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => jsonResponse({
      query: {
        pages: {
          1: {
            index: 1,
            title: "File:Exampletown anthem.ogg",
            imageinfo: [{
              url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Exampletown_anthem.ogg",
              descriptionurl: "https://commons.wikimedia.org/wiki/File:Exampletown_anthem.ogg",
              mime: "audio/ogg",
              mediatype: "AUDIO",
              extmetadata: {
                ObjectName: { value: "Exampletown anthem.ogg" },
                ImageDescription: { value: "Anthem of Exampletown" }
              }
            }]
          }
        }
      }
    });

    const result = await resolveWithCommonsAudioLookup("Exampletown", "Exampletown", "en");

    assert.equal(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects Commons audio with a conflicting language prefix", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => jsonResponse({
      query: {
        pages: {
          1: {
            index: 1,
            title: "File:En-us-Przykladowo.ogg",
            imageinfo: [{
              url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/En-us-Przykladowo.ogg",
              descriptionurl: "https://commons.wikimedia.org/wiki/File:En-us-Przykladowo.ogg",
              mime: "audio/ogg",
              mediatype: "AUDIO",
              extmetadata: {
                ObjectName: { value: "En-us-Przykladowo.ogg" }
              }
            }]
          }
        }
      }
    });

    const result = await resolveWithCommonsAudioLookup("Exampletown", "Przykladowo", "pl");

    assert.equal(result, null);
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
