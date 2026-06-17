import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(join(process.cwd(), "src/content/overlay-result-view.js"), "utf8");

test("normalizes overlay result display helpers", () => {
  const view = loadResultView();
  const result = {
    query: "Gnocchi",
    display: "Gnocchi",
    sourceForm: "gnocchi",
    aliases: ["gnocchi", " gnocchi ", "nyoh-kee"],
    variants: "regional; slow",
    trustSignals: ["source-backed", " source-backed "],
    pronunciation: {
      audio: [
        { label: "First", url: "ftp://bad.example/audio.ogg" },
        { label: "Verified", url: "https://audio.example/verified.ogg", quality: "verified" },
        { label: "Duplicate", url: "https://audio.example/verified.ogg" },
        { source: "Commons", url: "https://audio.example/commons.ogg" }
      ],
      simple: "NYOH-kee"
    },
    sources: [
      { label: "Wiktionary", url: "https://example.test/term" },
      { label: "Bad", url: "javascript:alert(1)" }
    ],
    alternateResults: [{
      display: "gnocco",
      languageName: "Italian",
      sourceStatus: "structured-source",
      pronunciation: { simple: "NYOH-koh" }
    }]
  };

  assert.equal(view.aliasesTextFromResult(result), "gnocchi; nyoh-kee");
  assert.equal(view.variantsTextFromResult(result), "regional; slow");
  assert.deepEqual(plain(view.trustSignalItems(result.trustSignals)), ["Trust: source-backed"]);
  assert.deepEqual(plain(view.variantItems(result.variants)), ["Variant: regional", "Variant: slow"]);
  assert.equal(view.getBestAudio(result).label, "Verified");
  assert.deepEqual(plain(view.audioItems(result)), [
    { label: "Verified", url: "https://audio.example/verified.ogg" },
    { label: "Commons", url: "https://audio.example/commons.ogg" }
  ]);
  assert.deepEqual(plain(view.sourceItems(result)), [
    { label: "Wiktionary", url: "https://example.test/term" },
    { label: "Verified", url: "https://audio.example/verified.ogg" },
    { label: "Commons", url: "https://audio.example/commons.ogg" }
  ]);
  assert.equal(view.firstSourceUrl(result), "https://example.test/term");
  assert.deepEqual(plain(view.alternateItems(result)), [{
    index: 0,
    display: "gnocco",
    summary: "gnocco · Italian · structured-source · NYOH-koh"
  }]);
});

test("normalizes overlay input helpers and escaping", () => {
  const view = loadResultView();

  assert.deepEqual(plain(view.normalizeAliases(" a, b\na; a ")), ["a", "b"]);
  assert.deepEqual(plain(view.normalizeLanguageHints(" pl, pt-BR, bad!, ja, pl ")), ["pl", "pt", "ja"]);
  assert.equal(view.normalizeText("  a\nb  "), "a b");
  assert.equal(view.normalizeLongText(` ${"x".repeat(2050)} `).length, 2048);
  assert.equal(view.escapeHtml(`<a href='x'>&"`), "&lt;a href=&#039;x&#039;&gt;&amp;&quot;");
  assert.match(view.correctionInput("Alias", "aliases", "\"quoted\"", 24), /data-correction-field="aliases"/);
  assert.match(view.correctionInput("Alias", "aliases", "\"quoted\"", 24), /value="&quot;quoted&quot;"/);
});

function loadResultView() {
  const context = vm.createContext({ URL });
  vm.runInContext(source, context);
  return context.__sayThisOverlayResultView;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
