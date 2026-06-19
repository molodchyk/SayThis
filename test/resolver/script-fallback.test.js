import assert from "node:assert/strict";
import test from "node:test";
import {
  detectScript,
  resolveTerm
} from "../../src/resolver-core.js";

test("keeps ambiguous-script fallback unspecific until language is resolved", () => {
  const script = detectScript("قطر");
  const result = resolveTerm("قطر", { entries: [] });

  assert.equal(script.script, "Arabic");
  assert.equal(result.sourceStatus, "generated-from-source");
  assert.equal(result.languageName, "Arabic-script term");
  assert.equal(result.language, "");
  assert.equal(result.ttsLang, "");
});

test("keeps unique-script fallback locales when the script maps cleanly", () => {
  const result = resolveTerm("Αθήνα", { entries: [] });

  assert.equal(result.sourceStatus, "generated-from-source");
  assert.equal(result.language, "el");
  assert.equal(result.ttsLang, "el-GR");
});
