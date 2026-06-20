import assert from "node:assert/strict";
import test from "node:test";
import {
  contextMenuDefinitions,
  MENU_IDS,
  resolveOptionsForMenuId
} from "../src/extension-actions.js";

test("defines one selected-text context menu action", () => {
  const definitions = contextMenuDefinitions();

  assert.equal(definitions.length, 1);
  assert.deepEqual(definitions.map((item) => item.id), [
    MENU_IDS.pronounceSelection
  ]);
  assert.ok(definitions.every((item) => item.contexts.includes("selection")));
  assert.equal(definitions[0].title, "SayThis: pronounce \"%s\"");
});

test("hides selected-text context menu action when disabled", () => {
  assert.deepEqual(contextMenuDefinitions({ contextMenuEnabled: false }), []);
});

test("maps context menu actions to resolver options", () => {
  assert.deepEqual(resolveOptionsForMenuId(MENU_IDS.pronounceSelection), {
    ok: true,
    source: "context-menu",
    options: {}
  });

  assert.equal(resolveOptionsForMenuId("saythis-pronounce-selection-online").ok, false);
  assert.equal(resolveOptionsForMenuId("other").ok, false);
});
