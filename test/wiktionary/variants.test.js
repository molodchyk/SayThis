import assert from "node:assert/strict";
import test from "node:test";
import {
  variantsFromWiktionaryText
} from "../../src/wiktionary/variants.js";

test("extracts bounded Wiktionary variant entries", () => {
  const text = `
===Alternative forms===
* {{alter|en|chiaro scuro|chiar'oscuro}}
* {{l|en|chiaroscuro variant}}
* [[brightdark|bright-dark]]
* plain form (field note)
* {{alt|en|chiaro scuro}}

===Noun===
# A related entry.
`;

  assert.deepEqual(variantsFromWiktionaryText(text), [
    "chiaro scuro",
    "chiar'oscuro",
    "chiaroscuro variant",
    "bright-dark",
    "plain form"
  ]);
});
