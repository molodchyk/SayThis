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
        { label: "Generated voice", source: "Voice service", url: "https://audio.example/generated.ogg", quality: "generated" },
        { label: "Voice service audio", source: "Voice service", url: "https://audio.example/generic-generated.ogg", quality: "generated" },
        { label: "Verified", url: "https://audio.example/verified.ogg", quality: "verified" },
        { label: "Source backed", source: "Community pack", url: "https://audio.example/source-backed.ogg", quality: "source-backed" },
        { label: "Curated", source: "SayThis", url: "https://audio.example/curated.ogg", quality: "curated" },
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
  assert.equal(view.getBestAudio(result).label, "Curated");
  assert.equal(view.hasPreferredAudio(result), true);
  assert.equal(view.hasTopTierAudio(result), true);
  assert.equal(view.hasTopTierAudio({
    pronunciation: {
      audio: [{
        label: "Verified",
        url: "https://audio.example/verified.ogg",
        quality: "verified"
      }]
    }
  }), false);
  assert.equal(view.hasPreferredAudio({
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        label: "Generated voice",
        url: "https://audio.example/generated.ogg",
        quality: "generated"
      }]
    }
  }), false);
  assert.equal(view.isSharedAudioCandidate({
    query: "P&L",
    display: "P&L",
    sourceForm: "P N L",
    language: "en",
    ttsLang: "en-US",
    sourceStatus: "structured-source"
  }, "P&L"), true);
  assert.equal(view.isSharedAudioCandidate({
    query: "Exampleterm",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "en",
    ttsLang: "en-US",
    sourceStatus: "structured-source"
  }, "Exampleterm"), false);
  assert.equal(view.isSharedAudioCandidate({
    query: "Saoirse",
    display: "Saoirse",
    sourceForm: "Saoirse",
    language: "ga",
    ttsLang: "ga-IE",
    sourceStatus: "structured-source"
  }, "Saoirse"), true);
  assert.equal(view.isSharedAudioCandidate({
    query: "Saoirse",
    display: "Saoirse",
    sourceForm: "Saoirse",
    language: "ga",
    ttsLang: "en-IE",
    sourceStatus: "structured-source"
  }, "Saoirse"), false);
  assert.equal(view.isSharedAudioCandidate({
    query: "Saoirse",
    display: "Saoirse",
    sourceForm: "Saoirse",
    language: "ga",
    ttsLang: "ga-IE",
    sourceStatus: "verified-audio",
    pronunciation: {
      audio: [{
        label: "Dictionary recording",
        url: "https://audio.example/verified.ogg",
        quality: "verified"
      }]
    }
  }, "Saoirse"), true);
  assert.deepEqual(plain(view.audioItems(result)), [
    { label: "Curated", source: "SayThis", url: "https://audio.example/curated.ogg", quality: "curated" },
    { label: "Source backed", source: "Community pack", url: "https://audio.example/source-backed.ogg", quality: "source-backed" },
    { label: "Verified", source: "", url: "https://audio.example/verified.ogg", quality: "verified" },
    { label: "Commons", source: "Commons", url: "https://audio.example/commons.ogg", quality: "" },
    { label: "Generated voice", source: "Voice service", url: "https://audio.example/generated.ogg", quality: "generated" },
    { label: "Generated fallback: Voice service audio", source: "Voice service", url: "https://audio.example/generic-generated.ogg", quality: "generated" }
  ]);
  assert.deepEqual(plain(view.playbackItems(result)), [
    { kind: "audio", label: "Curated", source: "SayThis", url: "https://audio.example/curated.ogg", quality: "curated" },
    { kind: "audio", label: "Source backed", source: "Community pack", url: "https://audio.example/source-backed.ogg", quality: "source-backed" },
    { kind: "audio", label: "Verified", source: "", url: "https://audio.example/verified.ogg", quality: "verified" },
    { kind: "audio", label: "Commons", source: "Commons", url: "https://audio.example/commons.ogg", quality: "" },
    { kind: "audio", label: "Generated voice", source: "Voice service", url: "https://audio.example/generated.ogg", quality: "generated" },
    { kind: "audio", label: "Generated fallback: Voice service audio", source: "Voice service", url: "https://audio.example/generic-generated.ogg", quality: "generated" }
  ]);
  assert.equal(view.playbackStatus({
    kind: "audio",
    quality: "generated"
  }), "Playing generated audio.");
  assert.deepEqual(plain(view.playbackItems({
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    pronunciation: {
      simple: "eg-ZAM-pluh-term"
    }
  })), [{
    kind: "speech",
    label: "Source-form speech",
    text: "Przykladowo",
    lang: "pl-PL"
  }, {
    kind: "guide",
    label: "Guide speech",
    text: "eg-ZAM-pluh-term"
  }]);
  assert.deepEqual(plain(view.playbackItems({
    query: "P&L",
    display: "P&L",
    sourceForm: "P N L",
    language: "en",
    ttsLang: "en-US"
  })), [{
    kind: "speech",
    label: "Source-form speech",
    text: "P N L",
    lang: "en-US"
  }]);
  assert.deepEqual(plain(view.playbackItems({
    query: "Exampleterm",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "en",
    ttsLang: "en-US",
    pronunciation: {
      simple: "eg-ZAM-pluh-term"
    }
  })), [{
    kind: "guide",
    label: "Guide speech",
    text: "eg-ZAM-pluh-term"
  }]);
  assert.deepEqual(plain(view.playbackItems({
    query: "Exampleterm",
    display: "Exampleterm",
    sourceForm: "Differentform",
    language: "ga",
    ttsLang: "en-IE",
    pronunciation: {
      simple: "eg-ZAM-pluh-term"
    }
  })), [{
    kind: "guide",
    label: "Guide speech",
    text: "eg-ZAM-pluh-term"
  }]);
  assert.deepEqual(plain(view.playbackItems({
    query: "Exampleterm",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "en",
    ttsLang: "en-US",
    pronunciation: {
      simple: "English pronunciations vary; source form should use a matching voice"
    }
  })), []);
  assert.equal(view.preferredSpeechResult({
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    pronunciation: {
      simple: "eg-ZAM-pluh-term"
    }
  }).speakText, "Przykladowo");
  assert.equal(view.preferredSpeechResult({
    query: "Exampleterm",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "en",
    ttsLang: "en-US",
    pronunciation: {
      simple: "English pronunciations vary; source form should use a matching voice"
    }
  })?.speakText, undefined);
  assert.equal(view.normalizeSpeakableGuide("p-shih-kla-doh-voh"), "p-shih-kla-doh-voh");
  assert.equal(view.normalizeSpeakableGuide("SEER-sha or SUR-sha, depending on speaker"), "");
  assert.equal(view.speechResultForPlaybackItem(result, {
    kind: "guide",
    text: "NYOH-kee"
  }).ttsLang, "en-US");
  assert.equal(view.speechResultForPlaybackItem({
    display: "Exampletown",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL"
  }, {
    kind: "speech",
    text: "Przykladowo",
    lang: "pl-PL"
  }).speakText, "Przykladowo");
  assert.deepEqual(plain(view.sourceItems(result)), [
    { label: "Wiktionary", url: "https://example.test/term" },
    { label: "Curated", url: "https://audio.example/curated.ogg" },
    { label: "Source backed", url: "https://audio.example/source-backed.ogg" },
    { label: "Verified", url: "https://audio.example/verified.ogg" },
    { label: "Commons", url: "https://audio.example/commons.ogg" },
    { label: "Generated voice", url: "https://audio.example/generated.ogg" },
    { label: "Generated fallback: Voice service audio", url: "https://audio.example/generic-generated.ogg" }
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
