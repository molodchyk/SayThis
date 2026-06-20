import assert from "node:assert/strict";
import test from "node:test";
import {
  getBestAudio
} from "../../../src/resolver-core.js";
import {
  resolveWithWiktionary,
  resolveWithWiktionaryCandidates
} from "../../../src/background/sources/online-sources.js";

test("uses lookup language hints for Wiktionary section selection", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      assert.equal(parsed.host, "en.wiktionary.org");
      return jsonResponse({
        query: {
          pages: [{
            title: "Exampleterm",
            revisions: [{
              slots: {
                main: {
                  content: `
==English==
===Pronunciation===
* {{IPA|en|/example/}}
* {{audio|en|En-exampleterm.ogg|Audio}}

==Polish==
===Pronunciation===
* {{IPA|pl|/ɛkˈzam.plɛ/}}
* {{audio|pl|Pl-exampleterm.ogg|Audio}}
`
                }
              }
            }]
          }]
        }
      });
    };

    const result = await resolveWithWiktionary("Exampleterm", {
      sourceLanguage: "en",
      languageHints: ["pl"]
    });

    assert.equal(result.language, "pl");
    assert.equal(result.languageName, "Polish");
    assert.equal(result.sourceStatus, "verified-audio");
    assert.equal(result.pronunciation.audio[0].url.includes("Pl-exampleterm.ogg"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("passes lookup language hints to Wiktionary source-form retries", async () => {
  const originalFetch = globalThis.fetch;
  const requestedEditions = [];

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      requestedEditions.push(parsed.host.split(".")[0]);
      const sourceLanguage = parsed.host.split(".")[0];
      const missing = sourceLanguage === "en";
      return jsonResponse({
        query: {
          pages: missing
            ? [{ missing: true }]
            : [{
              title: "Exampleform",
              revisions: [{
                slots: {
                  main: {
                    content: `
==Wymowa==
* {{IPA|pl|/ɛkˈzam.plɛ/}}
* {{audio|pl|Pl-exampleform.ogg|Audio}}
`
                  }
                }
              }]
            }]
        }
      });
    };

    const result = await resolveWithWiktionaryCandidates("Exampleterm", {
      display: "Exampleterm",
      sourceForm: "Exampleform",
      sourceStatus: "structured-source"
    }, {
      languageHints: ["pl"]
    });

    assert.deepEqual(requestedEditions, ["pl", "en"]);
    assert.equal(result.sourceForm, "Exampleform");
    assert.equal(result.language, "pl");
    assert.equal(result.sourceStatus, "verified-audio");
    assert.equal(result.pronunciation.audio[0].url.includes("Pl-exampleform.ogg"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps target-language Wiktionary result ahead of later mismatched audio", async () => {
  const originalFetch = globalThis.fetch;
  const requestedEditions = [];

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      const sourceLanguage = parsed.host.split(".")[0];
      requestedEditions.push(sourceLanguage);

      return jsonResponse({
        query: {
          pages: [{
            title: "Exampleterm",
            revisions: [{
              slots: {
                main: {
                  content: sourceLanguage === "pl"
                    ? `==Wymowa==\n* {{IPA|pl|/ɛkˈzam.plɛ/}}`
                    : `==English==\n===Pronunciation===\n* {{IPA|en|/example/}}\n* {{audio|en|En-exampleterm.ogg|Audio}}`
                }
              }
            }]
          }]
        }
      });
    };

    const result = await resolveWithWiktionary("Exampleterm", {
      languageHints: ["pl"]
    });

    assert.deepEqual(requestedEditions, ["pl", "en"]);
    assert.equal(result.language, "pl");
    assert.equal(result.sourceStatus, "structured-source");
    assert.equal(result.pronunciation.ipa, "/ɛkˈzam.plɛ/");
    assert.deepEqual(result.pronunciation.audio, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("continues target-language Wiktionary editions after generic audio to find native-speaker audio", async () => {
  const originalFetch = globalThis.fetch;
  const requestedEditions = [];

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      const sourceLanguage = parsed.host.split(".")[0];
      requestedEditions.push(sourceLanguage);

      return jsonResponse({
        query: {
          pages: [{
            title: "Exampleterm",
            revisions: [{
              slots: {
                main: {
                  content: sourceLanguage === "pl"
                    ? `==Wymowa==\n* {{IPA|pl|/ɛkˈzam.plɛ/}}\n* {{audio|pl|Pl-exampleterm.ogg|Audio}}`
                    : `==Polish==\n===Pronunciation===\n* {{IPA|pl|/ɛkˈzam.plɛ/}}\n* {{audio|pl|LL-Q809 (pol)-Speaker-Exampleterm.wav|Audio}}`
                }
              }
            }]
          }]
        }
      });
    };

    const result = await resolveWithWiktionary("Exampleterm", {
      languageHints: ["pl"]
    });

    assert.deepEqual(requestedEditions, ["pl", "en"]);
    assert.equal(result.language, "pl");
    assert.equal(getBestAudio(result).quality, "native-speaker");
    assert.equal(result.pronunciation.audio[0].url.includes("LL-Q809%20(pol)-Speaker-Exampleterm.wav"), true);
    assert.equal(result.pronunciation.audio[1].quality, "verified");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("continues Wiktionary source-form retries after generic audio to find native-speaker audio", async () => {
  const originalFetch = globalThis.fetch;
  const requestedTitles = [];

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      const title = parsed.searchParams.get("titles");
      requestedTitles.push(title);

      return jsonResponse({
        query: {
          pages: [{
            title,
            revisions: [{
              slots: {
                main: {
                  content: title === "Genericform"
                    ? `==Wymowa==\n* {{audio|pl|Pl-genericform.ogg|Audio}}`
                    : `==Wymowa==\n* {{audio|pl|LL-Q809 (pol)-Speaker-Nativeform.wav|Audio}}`
                }
              }
            }]
          }]
        }
      });
    };

    const result = await resolveWithWiktionaryCandidates("Exampleterm", {
      display: "Exampleterm",
      sourceForm: "Genericform",
      aliases: ["Nativeform"],
      language: "pl",
      sourceStatus: "structured-source"
    });

    assert.deepEqual(requestedTitles, ["Genericform", "Genericform", "Nativeform"]);
    assert.equal(result.sourceForm, "Genericform");
    assert.equal(result.language, "pl");
    assert.equal(getBestAudio(result).quality, "native-speaker");
    assert.equal(result.pronunciation.audio[0].url.includes("LL-Q809%20(pol)-Speaker-Nativeform.wav"), true);
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
