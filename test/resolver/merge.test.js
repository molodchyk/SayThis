import assert from "node:assert/strict";
import test from "node:test";
import {
  getBestAudio
} from "../../src/resolver/audio.js";
import {
  mergeRemoteResult
} from "../../src/resolver/merge.js";
import {
  createRemoteStructuredResult,
  resolveTerm
} from "../../src/resolver-core.js";

test("prefers remote structured result over best-effort fallback", () => {
  const local = resolveTerm("Unlistedterm", { entries: [] });
  const remote = createRemoteStructuredResult("Unlistedterm", {
    id: "remote:example",
    display: "Unlistedterm",
    sourceForm: "Unlistedterm",
    language: "la",
    category: "structured source match",
    evidence: ["Remote source"]
  });
  const merged = mergeRemoteResult(local, remote);

  assert.equal(merged.id, "remote:example");
  assert.equal(merged.language, "la");
  assert.deepEqual(merged.trustSignals, ["source-backed"]);
});

test("merges verified audio into a matching structured result", () => {
  const structured = createRemoteStructuredResult("Chiaroscuro", {
    id: "wiktionary:chiaroscuro",
    display: "chiaroscuro",
    sourceForm: "chiaroscuro",
    language: "it",
    category: "dictionary term",
    origin: "Italian root",
    pronunciation: { ipa: "/kja.roˈsku.ro/" },
    evidence: ["IPA from Wiktionary"],
    sources: [{ label: "Wiktionary", url: "https://en.wiktionary.org/wiki/chiaroscuro" }]
  });
  const audio = createRemoteStructuredResult("Chiaroscuro", {
    id: "forvo:chiaroscuro",
    display: "chiaroscuro",
    sourceForm: "chiaroscuro",
    language: "it",
    pronunciation: {
      audio: [{
        url: "https://example.com/chiaroscuro.ogg",
        label: "Pronunciation audio",
        quality: "verified"
      }]
    },
    evidence: ["Pronunciation audio from Forvo"],
    sources: [{ label: "Forvo word page", url: "https://forvo.com/word/chiaroscuro/#it" }]
  });
  const merged = mergeRemoteResult(structured, audio);

  assert.equal(merged.id, "wiktionary:chiaroscuro");
  assert.equal(merged.sourceStatus, "verified-audio");
  assert.equal(merged.confidence, "high");
  assert.equal(merged.origin, "Italian root");
  assert.equal(merged.pronunciation.ipa, "/kja.roˈsku.ro/");
  assert.equal(getBestAudio(merged).url, "https://example.com/chiaroscuro.ogg");
  assert.ok(merged.evidence.includes("IPA from Wiktionary"));
  assert.ok(merged.evidence.includes("Pronunciation audio from Forvo"));
  assert.ok(merged.sources.some((source) => source.label === "Forvo word page"));
  assert.deepEqual(merged.alternateResults, []);
});

test("merges verified audio from a variant into the structured result", () => {
  const structured = createRemoteStructuredResult("Exampleterm", {
    id: "wikidata:exampleterm",
    display: "Exampleterm",
    sourceForm: "Canonicalform",
    aliases: ["Example alias"],
    variants: ["Recordedform"],
    language: "pl",
    category: "structured source match",
    origin: "source-backed context",
    evidence: ["Structured source candidate"]
  });
  const audio = createRemoteStructuredResult("Recordedform", {
    id: "commons:recordedform",
    display: "Recordedform",
    sourceForm: "Recordedform",
    language: "pl",
    pronunciation: {
      audio: [{
        url: "https://example.com/recordedform.ogg",
        label: "Pronunciation audio",
        quality: "verified"
      }]
    },
    evidence: ["Pronunciation audio from source"]
  });
  const merged = mergeRemoteResult(structured, audio);

  assert.equal(merged.id, "wikidata:exampleterm");
  assert.equal(merged.sourceStatus, "verified-audio");
  assert.equal(merged.origin, "source-backed context");
  assert.deepEqual(merged.variants, ["Recordedform"]);
  assert.equal(getBestAudio(merged).url, "https://example.com/recordedform.ogg");
  assert.ok(merged.evidence.includes("Structured source candidate"));
  assert.ok(merged.evidence.includes("Pronunciation audio from source"));
  assert.deepEqual(merged.alternateResults, []);
});

test("merges generated audio into a matching structured result", () => {
  const structured = createRemoteStructuredResult("Exampleterm", {
    id: "remote:structured",
    display: "Exampleterm",
    sourceForm: "Sourceform",
    language: "pl",
    evidence: ["Structured source candidate"]
  });
  const generated = createRemoteStructuredResult("Exampleterm", {
    id: "voice:sourceform",
    display: "Sourceform",
    sourceForm: "Sourceform",
    language: "pl",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        url: "https://voice.example/speak?text=Sourceform&lang=pl-PL",
        label: "Voice service audio",
        quality: "generated"
      }]
    },
    evidence: ["Audio URL from voice service"]
  });
  const merged = mergeRemoteResult(structured, generated);

  assert.equal(merged.id, "remote:structured");
  assert.equal(merged.sourceStatus, "generated-audio");
  assert.equal(merged.sourceLabel, "Generated audio");
  assert.equal(merged.pronunciation.audio[0].quality, "generated");
});

test("keeps verified status when generated audio is merged after a recording", () => {
  const verified = createRemoteStructuredResult("Exampleterm", {
    id: "source:recording",
    display: "Exampleterm",
    sourceForm: "Sourceform",
    language: "pl",
    pronunciation: {
      audio: [{
        url: "https://audio.example/sourceform.ogg",
        label: "Native speaker recording",
        source: "Curated audio",
        quality: "native speaker"
      }]
    },
    evidence: ["Source-backed recording"]
  });
  const generated = createRemoteStructuredResult("Exampleterm", {
    id: "voice:sourceform",
    display: "Sourceform",
    sourceForm: "Sourceform",
    language: "pl",
    sourceStatus: "generated-audio",
    pronunciation: {
      audio: [{
        url: "https://voice.example/sourceform.ogg",
        label: "Generated fallback",
        source: "Voice service",
        quality: "generated"
      }]
    },
    evidence: ["Generated shared audio"]
  });
  const merged = mergeRemoteResult(verified, generated);

  assert.equal(merged.sourceStatus, "verified-audio");
  assert.equal(merged.sourceLabel, "Verified audio");
  assert.equal(getBestAudio(merged).url, "https://audio.example/sourceform.ogg");
  assert.deepEqual(merged.pronunciation.audio.map((item) => item.quality), ["native speaker", "generated"]);
  assert.ok(merged.evidence.includes("Source-backed recording"));
  assert.ok(merged.evidence.includes("Generated shared audio"));
});

test("preserves generated audio when a structured refresh has no recording", () => {
  const generated = createRemoteStructuredResult("Exampleterm", {
    id: "voice:sourceform",
    display: "Sourceform",
    sourceForm: "Sourceform",
    language: "pl",
    sourceStatus: "generated-audio",
    confidence: "low",
    pronunciation: {
      audio: [{
        url: "https://voice.example/speak?text=Sourceform&lang=pl-PL",
        label: "Voice service audio",
        quality: "generated"
      }]
    },
    evidence: ["Generated shared audio"]
  });
  const structured = createRemoteStructuredResult("Exampleterm", {
    id: "remote:structured",
    display: "Exampleterm",
    sourceForm: "Sourceform",
    language: "pl",
    confidence: "medium",
    evidence: ["Structured source candidate"]
  });
  const merged = mergeRemoteResult(generated, structured);

  assert.equal(merged.id, "remote:structured");
  assert.equal(merged.sourceStatus, "generated-audio");
  assert.equal(merged.sourceForm, "Sourceform");
  assert.equal(merged.pronunciation.audio[0].quality, "generated");
  assert.equal(merged.pronunciation.audio[0].url, "https://voice.example/speak?text=Sourceform&lang=pl-PL");
  assert.ok(merged.evidence.includes("Structured source candidate"));
  assert.ok(merged.evidence.includes("Generated shared audio"));
});

test("preserves useful displaced remote candidates", () => {
  const structured = createRemoteStructuredResult("Exampleterm", {
    id: "wikidata:exampleterm",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "la",
    pronunciation: { simple: "eg-ZAM-pluh-term" },
    evidence: ["Structured source candidate"]
  });
  const audio = createRemoteStructuredResult("Exampleterm", {
    id: "forvo:exampleterm",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "en",
    pronunciation: {
      audio: [{
        url: "https://example.com/exampleterm.ogg",
        label: "Pronunciation audio",
        quality: "verified"
      }]
    },
    evidence: ["Verified audio candidate"]
  });
  const merged = mergeRemoteResult(structured, audio);

  assert.equal(merged.id, "forvo:exampleterm");
  assert.equal(merged.alternateResults.length, 1);
  assert.equal(merged.alternateResults[0].id, "wikidata:exampleterm");
  assert.equal(merged.alternateResults[0].ttsLang, "it-IT");
  assert.equal(merged.alternateResults[0].pronunciation.simple, "eg-ZAM-pluh-term");
});

test("does not expose best-effort fallback as an alternate candidate", () => {
  const fallback = resolveTerm("Unlistedterm", { entries: [] });
  const remote = createRemoteStructuredResult("Unlistedterm", {
    id: "remote:unlistedterm",
    display: "Unlistedterm",
    sourceForm: "Unlistedterm",
    language: "en",
    pronunciation: { simple: "un-LIS-ted-term" }
  });
  const merged = mergeRemoteResult(fallback, remote);

  assert.equal(merged.id, "remote:unlistedterm");
  assert.deepEqual(merged.alternateResults, []);
});
