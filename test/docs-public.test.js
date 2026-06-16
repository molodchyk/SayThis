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

test("documents community service deployment artifacts", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const deployment = await readFile(new URL("../docs/deployment.md", import.meta.url), "utf8");
  const dockerfile = await readFile(new URL("../Dockerfile.community", import.meta.url), "utf8");
  const dockerignore = await readFile(new URL("../.dockerignore", import.meta.url), "utf8");

  assert.match(readme, /docs\/deployment\.md/);
  assert.match(deployment, /docker build -f Dockerfile\.community/);
  assert.match(deployment, /SAYTHIS_ADMIN_TOKEN/);
  assert.match(dockerfile, /SAYTHIS_STORE=\/data\/community-store\.json/);
  assert.match(dockerfile, /server\/community-service\.js/);
  assert.match(dockerignore, /assets\/audio\/private/);
  assert.match(dockerignore, /data\/licensed/);
});
