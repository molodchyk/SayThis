import assert from "node:assert/strict";
import test from "node:test";
import {
  createRemoteStructuredResult
} from "../../src/resolver-core.js";
import {
  languageCodeFromLanguage,
  languageNameFromCode,
  normalizeTtsLanguage,
  scriptHintForScript,
  ttsLangFromLanguage
} from "../../src/resolver/language.js";

test("maps resolver language helpers from a narrow module", () => {
  assert.equal(languageCodeFromLanguage("Polish"), "pl");
  assert.equal(languageCodeFromLanguage("pt_br"), "pt-BR");
  assert.equal(ttsLangFromLanguage("hy"), "hy-AM");
  assert.equal(ttsLangFromLanguage("Polish"), "pl-PL");
  assert.equal(ttsLangFromLanguage("pt-BR"), "pt-BR");
  assert.equal(normalizeTtsLanguage("Polish"), "pl-PL");
  assert.equal(normalizeTtsLanguage("", "Polish"), "pl-PL");
  assert.equal(languageNameFromCode("tr"), "Turkish");
  assert.equal(scriptHintForScript("Greek").ttsLang, "el-GR");
  assert.deepEqual(scriptHintForScript("Unknown"), {});
});

test("maps structured source language codes to speech locales", () => {
  const cases = [
    ["ga", "ga-IE"],
    ["hy", "hy-AM"],
    ["hi", "hi-IN"],
    ["la", "la"],
    ["th", "th-TH"],
    ["bg", "bg-BG"],
    ["sr", "sr-RS"],
    ["uk", "uk-UA"]
  ];

  for (const [language, ttsLang] of cases) {
    const result = createRemoteStructuredResult("Exampleterm", {
      id: `remote:${language}`,
      display: "Exampleterm",
      sourceForm: "Exampleterm",
      language
    });

    assert.equal(result.ttsLang, ttsLang);
  }
});

test("maps structured source language names to provider locales", () => {
  const result = createRemoteStructuredResult("Exampleterm", {
    id: "remote:language-name",
    display: "Exampleterm",
    sourceForm: "Przykladowo",
    language: "Polish",
    ttsLang: "Polish"
  });

  assert.equal(result.language, "pl");
  assert.equal(result.languageName, "Polish");
  assert.equal(result.ttsLang, "pl-PL");
});
