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

test("rejects Commons audio when the lookup only appears inside a longer word", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => jsonResponse({
      query: {
        pages: {
          1: {
            index: 1,
            title: "File:En-us-Roman.ogg",
            imageinfo: [{
              url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/En-us-Roman.ogg",
              descriptionurl: "https://commons.wikimedia.org/wiki/File:En-us-Roman.ogg",
              mime: "audio/ogg",
              mediatype: "AUDIO",
              extmetadata: {
                ObjectName: { value: "En-us-Roman.ogg" },
                ImageDescription: { value: "Roman pronunciation" }
              }
            }]
          }
        }
      }
    });

    const result = await resolveWithCommonsAudioLookup("Roma", "Roma", "en");

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

test("accepts source-backed pronunciation guide audio with a different file prefix", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => jsonResponse({
      query: {
        pages: {
          1: {
            index: 1,
            title: "File:En-us-Gia_Dzhokhtaberidze_from_Georgia_pronunciation_(Voice_of_America).ogg",
            imageinfo: [{
              url: "https://upload.wikimedia.org/wikipedia/commons/6/67/En-us-Gia_Dzhokhtaberidze_from_Georgia_pronunciation_%28Voice_of_America%29.ogg",
              descriptionurl: "https://commons.wikimedia.org/wiki/File:En-us-Gia_Dzhokhtaberidze_from_Georgia_pronunciation_(Voice_of_America).ogg",
              mime: "audio/ogg",
              mediatype: "AUDIO",
              extmetadata: {
                ObjectName: { value: "En-us-Gia Dzhokhtaberidze pronunciation" },
                ImageDescription: { value: "Voice of America pronunciation of Gia Dzhokhtaberidze" },
                Credit: { value: "VOA pronunciation guide: Gia Dzhokhtaberidze" }
              }
            }]
          }
        }
      }
    });

    const result = await resolveWithCommonsAudioLookup("Gia Dzhokhtaberidze", "Gia Dzhokhtaberidze", "ka");

    assert.equal(result.sourceStatus, "verified-audio");
    assert.equal(result.pronunciation.audio[0].label, "Voice of America pronunciation");
    assert.equal(result.pronunciation.audio[0].source, "Wikimedia Commons (Voice of America pronunciation guide)");
    assert.equal(result.pronunciation.audio[0].quality, "source-backed");
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

test("ranks Lingua Libre Commons recordings as native-speaker audio", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => jsonResponse({
      query: {
        pages: {
          1: {
            index: 1,
            title: "File:Fr-Exampletown.ogg",
            imageinfo: [{
              url: "https://upload.wikimedia.org/wikipedia/commons/f/f1/Fr-Exampletown.ogg",
              descriptionurl: "https://commons.wikimedia.org/wiki/File:Fr-Exampletown.ogg",
              mime: "audio/ogg",
              mediatype: "AUDIO",
              extmetadata: {
                ObjectName: { value: "Fr-Exampletown.ogg" }
              }
            }]
          },
          2: {
            index: 2,
            title: "File:LL-Q150 (fra)-Speaker-Exampletown.wav",
            imageinfo: [{
              url: "https://upload.wikimedia.org/wikipedia/commons/l/l1/LL-Q150_fra-Speaker-Exampletown.wav",
              descriptionurl: "https://commons.wikimedia.org/wiki/File:LL-Q150_(fra)-Speaker-Exampletown.wav",
              mime: "audio/wav",
              mediatype: "AUDIO",
              extmetadata: {
                ObjectName: { value: "LL-Q150 (fra)-Speaker-Exampletown.wav" }
              }
            }]
          }
        }
      }
    });

    const result = await resolveWithCommonsAudioLookup("Exampletown", "Exampletown", "fr");

    assert.equal(result.sourceStatus, "verified-audio");
    assert.equal(result.pronunciation.audio[0].url, "https://upload.wikimedia.org/wikipedia/commons/l/l1/LL-Q150_fra-Speaker-Exampletown.wav");
    assert.equal(result.pronunciation.audio[0].label, "Lingua Libre audio");
    assert.equal(result.pronunciation.audio[0].source, "Wikimedia Commons (Lingua Libre)");
    assert.equal(result.pronunciation.audio[0].quality, "native-speaker");
    assert.equal(result.pronunciation.audio[1].quality, "verified");
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
