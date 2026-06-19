import assert from "node:assert/strict";
import test from "node:test";
import {
  getBestAudio
} from "../../../src/resolver-core.js";
import {
  resolveWithCustomSourceCandidates
} from "../../../src/background/online-sources.js";

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

test("continues custom source retries after generic audio to find native audio", async () => {
  const originalFetch = globalThis.fetch;
  const requestedQueries = [];

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      const query = parsed.searchParams.get("q");
      requestedQueries.push(query);
      assert.equal(parsed.origin, "https://packs.example");

      if (query === "Genericform") {
        return jsonResponse({
          sourceName: "Research pack",
          entries: [{
            term: "Genericform",
            sourceForm: "Genericform",
            language: "it",
            audioUrl: "https://packs.example/audio/genericform.ogg"
          }]
        });
      }

      if (query === "Nativeform") {
        return jsonResponse({
          sourceName: "Research pack",
          entries: [{
            term: "Nativeform",
            sourceForm: "Nativeform",
            language: "it",
            audioUrl: "https://packs.example/audio/nativeform.ogg",
            audioQuality: "native-speaker"
          }]
        });
      }

      return jsonResponse({ entries: [] });
    };

    const result = await resolveWithCustomSourceCandidates("bright-dark", {
      display: "bright-dark",
      sourceForm: "Genericform",
      aliases: ["Nativeform"],
      language: "it",
      sourceStatus: "structured-source",
      confidence: "medium"
    }, "https://packs.example/search", "Research pack");

    assert.deepEqual(requestedQueries, ["Genericform", "Nativeform"]);
    assert.equal(result.sourceForm, "Genericform");
    assert.equal(result.language, "it");
    assert.equal(getBestAudio(result).quality, "native-speaker");
    assert.equal(getBestAudio(result).url, "https://packs.example/audio/nativeform.ogg");
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
