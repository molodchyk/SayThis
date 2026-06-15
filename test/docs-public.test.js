import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("README links the public privacy policy", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const policy = await readFile(new URL("../docs/privacy-policy.md", import.meta.url), "utf8");

  assert.match(readme, /docs\/privacy-policy\.md/);
  assert.match(policy, /## Data Sent To Remote Services/);
  assert.match(policy, /Forvo API keys stay in local extension storage/);
  assert.match(policy, /does not submit page URLs or browsing history/);
});
