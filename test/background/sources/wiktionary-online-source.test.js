import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveWithWiktionary,
  resolveWithWiktionaryCandidates
} from "../../../src/background/online-sources.js";

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

    assert.deepEqual(requestedEditions, ["en", "pl"]);
    assert.equal(result.sourceForm, "Exampleform");
    assert.equal(result.language, "pl");
    assert.equal(result.sourceStatus, "verified-audio");
    assert.equal(result.pronunciation.audio[0].url.includes("Pl-exampleform.ogg"), true);
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
