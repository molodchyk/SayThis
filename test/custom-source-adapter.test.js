import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomSourceResult,
  buildCustomSourceUrl,
  selectBestCustomEntry
} from "../src/custom-source-adapter.js";

test("builds a custom source lookup URL", () => {
  const url = new URL(buildCustomSourceUrl("chiaroscuro", "https://example.com/saythis/search?pack=art"));

  assert.equal(url.origin, "https://example.com");
  assert.equal(url.pathname, "/saythis/search");
  assert.equal(url.searchParams.get("pack"), "art");
  assert.equal(url.searchParams.get("q"), "chiaroscuro");
});

test("rejects non-https custom source endpoints", () => {
  assert.equal(buildCustomSourceUrl("term", "http://example.com/search"), "");
});

test("selects the matching custom source entry", () => {
  const entry = selectBestCustomEntry("chiaroscuro", {
    entries: [{
      term: "sfumato",
      sourceForm: "sfumato",
      simple: "sfoo-MAH-toh"
    }, {
      term: "chiaroscuro",
      aliases: ["light-dark"],
      sourceForm: "chiaroscuro",
      ipa: "kjaroˈskuːro",
      confidence: "high"
    }]
  });

  assert.equal(entry.term, "chiaroscuro");
});

test("matches custom source string aliases from keyed entry maps", () => {
  const entry = selectBestCustomEntry("light-dark", {
    entries: {
      art_chiaroscuro: {
        term: "chiaroscuro",
        aliases: "light-dark; bright-dark",
        sourceForm: "chiaroscuro",
        simple: "kee-ah-roh-SKOO-roh"
      }
    }
  });

  assert.equal(entry.term, "chiaroscuro");
});

test("builds a structured custom source result", () => {
  const result = buildCustomSourceResult("chiaroscuro", {
    sourceName: "Art terms",
    entries: [{
      id: "art:chiaroscuro",
      term: "chiaroscuro",
      sourceForm: "chiaroscuro",
      aliases: ["light-dark"],
      trustSignals: ["domain-reviewed"],
      language: "it",
      languageName: "Italian",
      category: "art-term",
      root: "chiaro + scuro",
      domain: "painting",
      ipa: "kjaroˈskuːro",
      simple: "kee-ah-roh-SKOO-roh",
      audioUrl: "https://example.com/audio/chiaroscuro.ogg",
      sourceUrl: "https://example.com/terms/chiaroscuro",
      evidence: ["Reviewed by domain editor"],
      notes: "Common English use keeps the Italian root."
    }]
  });

  assert.equal(result.id, "custom:art:chiaroscuro");
  assert.equal(result.sourceForm, "chiaroscuro");
  assert.deepEqual(result.aliases, ["light-dark"]);
  assert.deepEqual(result.trustSignals, ["domain-reviewed"]);
  assert.equal(result.language, "it");
  assert.equal(result.category, "art-term");
  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.confidence, "high");
  assert.equal(result.pronunciation.ipa, "kjaroˈskuːro");
  assert.equal(result.pronunciation.audio[0].url, "https://example.com/audio/chiaroscuro.ogg");
  assert.ok(result.evidence.includes("Structured result from Art terms"));
  assert.ok(result.evidence.includes("Root: chiaro + scuro"));
  assert.ok(result.sources.some((source) => source.url === "https://example.com/terms/chiaroscuro"));
});

test("preserves custom source string aliases on results", () => {
  const result = buildCustomSourceResult("light-dark", {
    entries: {
      art_chiaroscuro: {
        term: "chiaroscuro",
        aliases: "light-dark; bright-dark; light-dark",
        sourceForm: "chiaroscuro",
        language: "it",
        simple: "kee-ah-roh-SKOO-roh"
      }
    }
  });

  assert.deepEqual(result.aliases, ["light-dark", "bright-dark"]);
  assert.equal(result.sourceForm, "chiaroscuro");
  assert.equal(result.pronunciation.simple, "kee-ah-roh-SKOO-roh");
});

test("preserves alternate custom source matches", () => {
  const result = buildCustomSourceResult("lume", {
    sourceName: "Research pack",
    entries: [{
      id: "term:lume-it",
      term: "lume",
      sourceForm: "lume",
      language: "it",
      audioUrl: "https://example.com/audio/lume-it.ogg",
      simple: "LOO-meh"
    }, {
      id: "term:lume-pt",
      term: "lume",
      sourceForm: "lume",
      language: "pt",
      simple: "LOO-mee"
    }, {
      id: "term:sfumato",
      term: "sfumato",
      sourceForm: "sfumato",
      language: "it",
      simple: "sfoo-MAH-toh"
    }]
  });

  assert.equal(result.id, "custom:term:lume-it");
  assert.equal(result.language, "it");
  assert.equal(result.alternateResults.length, 1);
  assert.equal(result.alternateResults[0].id, "custom:term:lume-pt");
  assert.equal(result.alternateResults[0].language, "pt");
  assert.equal(result.alternateResults[0].pronunciation.simple, "LOO-mee");
});
