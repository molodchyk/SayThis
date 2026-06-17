import assert from "node:assert/strict";
import test from "node:test";
import {
  renderPopupResult
} from "../../src/popup/result-renderer.js";

test("hides the result card for empty results", () => {
  const elements = createElements();
  elements.resultCard.hidden = false;

  renderPopupResult(null, elements);

  assert.equal(elements.resultCard.hidden, true);
});

test("renders result fields and correction prefill values", () => {
  const elements = createElements();
  const result = sampleResult();

  renderPopupResult(result, elements, {
    document: fakeDocument()
  });

  assert.equal(elements.resultCard.hidden, false);
  assert.equal(elements.resultDisplay.textContent, "Exemplum");
  assert.equal(elements.confidenceBadge.textContent, "high");
  assert.equal(elements.sourceBadge.textContent, "Dictionary");
  assert.equal(elements.sourceForm.textContent, "Exemplum");
  assert.equal(elements.aliasesDisplay.textContent, "Example; Sample");
  assert.equal(elements.language.textContent, "Latin");
  assert.equal(elements.category.textContent, "term");
  assert.equal(elements.origin.textContent, "Latin");
  assert.equal(elements.root.textContent, "example-root");
  assert.equal(elements.domainHint.textContent, "research");
  assert.equal(elements.variants.textContent, "Exempla");
  assert.equal(elements.ipa.textContent, "/eg.zem.plum/");
  assert.equal(elements.simpleGuide.textContent, "eg-ZEM-plum");
  assert.equal(elements.correctionSource.value, "Exemplum");
  assert.equal(elements.correctionAliases.value, "Example; Sample");
  assert.equal(elements.correctionLanguage.value, "la");
  assert.equal(elements.correctionAudio.value, "https://example.test/audio.ogg");
  assert.equal(elements.correctionSourceUrl.value, "https://example.test/source");
});

test("renders playback, alternate, evidence, and source lists", () => {
  const elements = createElements();
  const spokenAlternates = [];
  const playedAudio = [];
  const statuses = [];

  renderPopupResult(sampleResult(), elements, {
    document: fakeDocument(),
    speakAlternate: (index, rate) => spokenAlternates.push({ index, rate }),
    playAudioItem: (item, result, rate) => {
      playedAudio.push({ item, result, rate });
      return true;
    },
    setStatus: (value) => statuses.push(value)
  });

  const alternateButton = elements.alternates.children[0].children[0];
  alternateButton.events.click();
  assert.deepEqual(spokenAlternates, [{ index: 0, rate: 0.82 }]);

  const audioButton = elements.audioList.children[0].children[0];
  audioButton.events.click();
  assert.equal(playedAudio[0].item.url, "https://example.test/audio.ogg");
  assert.equal(playedAudio[0].rate, 0.82);
  assert.deepEqual(statuses, ["Playing recording."]);

  assert.equal(elements.evidence.children[0].textContent, "Structured source");
  assert.equal(elements.sources.children[0].children[0].href, "https://example.test/source");
  assert.equal(elements.sources.children[0].children[0].target, "_blank");
  assert.equal(elements.sources.children[0].children[0].rel, "noreferrer");
});

function sampleResult() {
  return {
    query: "Example",
    display: "Exemplum",
    sourceForm: "Exemplum",
    aliases: ["Sample"],
    language: "la",
    languageName: "Latin",
    category: "term",
    origin: "Latin",
    root: "example-root",
    domainHint: "research",
    variants: ["Exempla"],
    confidence: "high",
    sourceLabel: "Dictionary",
    pronunciation: {
      ipa: "/eg.zem.plum/",
      simple: "eg-ZEM-plum",
      audio: [{
        url: "https://example.test/audio.ogg",
        label: "Recording"
      }]
    },
    evidence: ["Structured source"],
    sources: [{
      url: "https://example.test/source",
      label: "Source"
    }],
    alternateResults: [{
      display: "Exempla",
      sourceForm: "Exempla",
      languageName: "Latin",
      sourceLabel: "Dictionary",
      pronunciation: {
        simple: "eg-ZEM-pla"
      }
    }]
  };
}

function createElements() {
  const keys = [
    "resultCard",
    "resultDisplay",
    "confidenceBadge",
    "sourceBadge",
    "sourceForm",
    "aliasesDisplay",
    "language",
    "category",
    "origin",
    "root",
    "domainHint",
    "variants",
    "ipa",
    "simpleGuide",
    "alternates",
    "audioList",
    "evidence",
    "sources",
    "correctionSource",
    "correctionAliases",
    "correctionLanguage",
    "correctionLanguageName",
    "correctionSimple",
    "correctionIpa",
    "correctionOrigin",
    "correctionRoot",
    "correctionDomain",
    "correctionVariants",
    "correctionAudio",
    "correctionSourceUrl",
    "correctionVariant"
  ];

  return Object.fromEntries(keys.map((key) => [key, createElement(key)]));
}

function fakeDocument() {
  return {
    createElement
  };
}

function createElement(tagName) {
  return {
    tagName,
    children: [],
    className: "",
    currentTime: 0,
    events: {},
    hidden: false,
    href: "",
    rel: "",
    target: "",
    textContent: "",
    type: "",
    value: "",
    addEventListener(name, callback) {
      this.events[name] = callback;
    },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    }
  };
}
