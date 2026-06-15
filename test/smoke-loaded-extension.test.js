import assert from "node:assert/strict";
import test from "node:test";
import {
  runLoadedExtensionSmoke
} from "../scripts/smoke-loaded-extension.mjs";

test("loaded-extension smoke skips unless launch is explicit", async () => {
  const result = await runLoadedExtensionSmoke({
    allowLaunch: false,
    executable: "not-used"
  });

  assert.equal(result.skipped, true);
  assert.match(result.reason, /SAYTHIS_SMOKE_LAUNCH=1/);
});
