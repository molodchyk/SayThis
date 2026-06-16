import assert from "node:assert/strict";
import test from "node:test";
import {
  runLoadedExtensionSmoke,
  shouldCloseLaunchedBrowser
} from "../scripts/smoke-loaded-extension.mjs";

test("loaded-extension smoke skips unless launch is explicit", async () => {
  const result = await runLoadedExtensionSmoke({
    allowLaunch: false,
    executable: "not-used"
  });

  assert.equal(result.skipped, true);
  assert.match(result.reason, /SAYTHIS_SMOKE_LAUNCH=1/);
});

test("loaded-extension smoke does not close from environment settings", () => {
  const previous = process.env.SAYTHIS_SMOKE_CLOSE;
  process.env.SAYTHIS_SMOKE_CLOSE = "1";

  try {
    assert.equal(shouldCloseLaunchedBrowser({}), false);
  } finally {
    if (previous === undefined) {
      delete process.env.SAYTHIS_SMOKE_CLOSE;
    } else {
      process.env.SAYTHIS_SMOKE_CLOSE = previous;
    }
  }
});

test("loaded-extension smoke close remains explicit for direct callers", () => {
  assert.equal(shouldCloseLaunchedBrowser({ closeLaunchedBrowser: true }), true);
  assert.equal(shouldCloseLaunchedBrowser({ closeLaunchedBrowser: false }), false);
});
