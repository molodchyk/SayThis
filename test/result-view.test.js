import assert from "node:assert/strict";
import test from "node:test";
import {
  alternateItemsForResult,
  audioItemsForResult,
  evidenceItemsForResult,
  playbackItemsForResult,
  preferredSpeechResultForResult,
  speechResultForPlaybackItem,
  sourceItemsForResult
} from "../src/result-view.js";

test("builds evidence items with community context", () => {
  const items = evidenceItemsForResult({
    trustSignals: ["source-backed"],
    evidence: ["Structured source", ""],
    notes: "Regional variant",
    community: {
      confirmations: 1,
      corrections: 2,
      requests: 3,
      flags: 4
    }
  });

  assert.deepEqual(items, [
    "Trust: source-backed",
    "Structured source",
    "Regional variant",
    "1 local confirmation",
    "2 local corrections",
    "3 local requests"
  ]);
});

test("builds evidence items with wrong-result flag context", () => {
  const items = evidenceItemsForResult({
    community: {
      flags: 1
    }
  });

  assert.deepEqual(items, [
    "1 local wrong-result flag"
  ]);
});

test("builds evidence items with variant note aliases", () => {
  const items = evidenceItemsForResult({
    variants: ["Studio pronunciation", "Studio pronunciation"],
    variantNote: "Regional pronunciation variant"
  });

  assert.deepEqual(items, [
    "Variant: Studio pronunciation",
    "Regional pronunciation variant"
  ]);
});

test("builds evidence items with pronunciation roots", () => {
  const items = evidenceItemsForResult({
    evidence: ["Root: chiaro + oscuro"],
    root: "chiaro + oscuro"
  });

  assert.deepEqual(items, [
    "Root: chiaro + oscuro"
  ]);
});

test("builds evidence items with pronunciation domain hints", () => {
  const items = evidenceItemsForResult({
    domainHint: "art history"
  });

  assert.deepEqual(items, [
    "Domain: art history"
  ]);
});

test("builds safe unique source links from result sources and audio", () => {
  const items = sourceItemsForResult({
    sources: [{
      label: "Wiktionary",
      url: "https://en.wiktionary.org/wiki/chiaroscuro"
    }, {
      label: "Plain HTTP",
      url: "http://example.com/source"
    }, {
      label: "Unsafe",
      url: "javascript:alert(1)"
    }],
    pronunciation: {
      audio: [{
        label: "Pronunciation audio",
        url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Example.ogg"
      }, {
        label: "Duplicate",
        url: "https://en.wiktionary.org/wiki/chiaroscuro"
      }]
    }
  });

  assert.deepEqual(items, [{
    label: "Wiktionary",
    url: "https://en.wiktionary.org/wiki/chiaroscuro"
  }, {
    label: "Pronunciation audio",
    url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Example.ogg"
  }]);
});

test("builds playable audio items", () => {
  const items = audioItemsForResult({
    pronunciation: {
      audio: [{
        label: "Generated service",
        source: "Voice service",
        quality: "generated",
        url: "https://voice.example/generated.ogg"
      }, {
        label: "Primary recording",
        source: "Forvo",
        quality: "verified",
        url: "https://example.com/primary.ogg"
      }, {
        label: "Curated pronunciation",
        source: "SayThis",
        quality: "curated",
        url: "chrome-extension://id/curated.ogg"
      }, {
        label: "Duplicate",
        url: "https://example.com/primary.ogg"
      }, {
        label: "Unsafe",
        url: "javascript:alert(1)"
      }, {
        source: "Archive",
        url: "chrome-extension://id/audio.ogg"
      }]
    }
  });

  assert.deepEqual(items, [{
    label: "Curated pronunciation",
    source: "SayThis",
    quality: "curated",
    url: "chrome-extension://id/curated.ogg"
  }, {
    label: "Primary recording",
    source: "Forvo",
    quality: "verified",
    url: "https://example.com/primary.ogg"
  }, {
    label: "Archive",
    source: "Archive",
    quality: "",
    url: "chrome-extension://id/audio.ogg"
  }, {
    label: "Generated service",
    source: "Voice service",
    quality: "generated",
    url: "https://voice.example/generated.ogg"
  }]);
});

test("builds playback items from audio before source speech and guide speech", () => {
  assert.deepEqual(playbackItemsForResult({
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    pronunciation: {
      simple: "eg-ZAM-pluh-term",
      audio: [{
        label: "Primary recording",
        url: "https://example.com/primary.ogg"
      }]
    }
  }), [{
    kind: "audio",
    label: "Primary recording",
    source: "",
    quality: "",
    url: "https://example.com/primary.ogg"
  }]);

  assert.deepEqual(playbackItemsForResult({
    query: "Exampletown",
    display: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    pronunciation: {
      simple: "eg-ZAM-pluh-term"
    }
  }), [{
    kind: "speech",
    label: "Source-form speech",
    text: "Przykladowo",
    lang: "pl-PL"
  }, {
    kind: "guide",
    label: "Guide speech",
    text: "eg-ZAM-pluh-term"
  }]);

  assert.deepEqual(playbackItemsForResult({
    pronunciation: {
      simple: "eg-ZAM-pluh-term"
    }
  }), [{
    kind: "guide",
    label: "Guide speech",
    text: "eg-ZAM-pluh-term"
  }]);
});

test("builds speech-specific result copies for playback rows", () => {
  const result = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    speakText: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    pronunciation: {
      simple: "p-shih-kla-doh-voh"
    }
  };

  assert.deepEqual(speechResultForPlaybackItem(result, {
    kind: "speech",
    text: "Przykladowo",
    lang: "pl-PL"
  }), {
    ...result,
    sourceForm: "Przykladowo",
    speakText: "Przykladowo",
    ttsLang: "pl-PL"
  });

  assert.deepEqual(speechResultForPlaybackItem(result, {
    kind: "guide",
    text: "p-shih-kla-doh-voh"
  }), {
    ...result,
    speakText: "p-shih-kla-doh-voh",
    ttsLang: "en-US",
    pronunciation: {
      simple: "p-shih-kla-doh-voh"
    }
  });
});

test("prefers source-form speech before guide speech", () => {
  const result = {
    display: "Exampletown",
    sourceForm: "Przykladowo",
    ttsLang: "pl-PL",
    pronunciation: {
      simple: "p-shih-kla-doh-voh"
    }
  };

  assert.deepEqual(preferredSpeechResultForResult(result), {
    ...result,
    sourceForm: "Przykladowo",
    speakText: "Przykladowo",
    ttsLang: "pl-PL"
  });

  assert.deepEqual(preferredSpeechResultForResult({
    display: "Exampletown",
    pronunciation: {
      simple: "p-shih-kla-doh-voh"
    }
  }), {
    display: "Exampletown",
    speakText: "p-shih-kla-doh-voh",
    ttsLang: "en-US",
    pronunciation: {
      simple: "p-shih-kla-doh-voh"
    }
  });
});

test("builds compact alternate candidate summaries", () => {
  const items = alternateItemsForResult({
    alternateResults: [{
      display: "Exampleterm",
      sourceForm: "Exampleterm",
      languageName: "Latin",
      sourceLabel: "Structured source",
      pronunciation: {
        simple: "eg-ZAM-pluh-term"
      }
    }, {
      display: "",
      sourceForm: "",
      languageName: ""
    }]
  });

  assert.deepEqual(items, [{
    index: 0,
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "Latin",
    source: "Structured source",
    guide: "eg-ZAM-pluh-term",
    summary: "Exampleterm · Latin · Structured source · eg-ZAM-pluh-term"
  }]);
});
