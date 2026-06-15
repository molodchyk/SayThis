import assert from "node:assert/strict";
import test from "node:test";
import {
  contextMenuDefinitions,
  MENU_IDS,
  resolveOptionsForMenuId
} from "../src/extension-actions.js";

test("defines local and online context menu actions", () => {
  const definitions = contextMenuDefinitions();

  assert.equal(definitions.length, 2);
  assert.deepEqual(definitions.map((item) => item.id), [
    MENU_IDS.pronounceSelection,
    MENU_IDS.pronounceSelectionOnline
  ]);
  assert.ok(definitions.every((item) => item.contexts.includes("selection")));
  assert.ok(definitions[1].title.includes("online lookup"));
});

test("maps context menu actions to resolver options", () => {
  assert.deepEqual(resolveOptionsForMenuId(MENU_IDS.pronounceSelection), {
    ok: true,
    source: "context-menu",
    options: {}
  });

  assert.deepEqual(resolveOptionsForMenuId(MENU_IDS.pronounceSelectionOnline), {
    ok: true,
    source: "context-menu-online",
    options: { useOnline: true }
  });

  assert.equal(resolveOptionsForMenuId("other").ok, false);
});
