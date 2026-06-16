import assert from "node:assert/strict";
import test from "node:test";
import {
  countLines,
  createArchitectureAudit,
  fileSizeFindings,
  folderDensityFindings,
  normalizeAuditPath
} from "../scripts/audit-architecture.mjs";

test("normalizes audit paths and counts lines", () => {
  assert.equal(normalizeAuditPath("\\src\\background.js"), "src/background.js");
  assert.equal(countLines("one\ntwo\n"), 2);
  assert.equal(countLines(""), 0);
});

test("keeps known large files as notices while inside baseline", () => {
  const audit = createArchitectureAudit({
    files: [{
      path: "src/background.js",
      lineCount: 929
    }],
    folders: []
  });

  assert.equal(audit.ok, true);
  assert.equal(audit.fileFindings.length, 1);
  assert.equal(audit.fileFindings[0].severity, "notice");
  assert.equal(audit.fileFindings[0].baseline, 929);
});

test("fails when a large file grows past its baseline", () => {
  const findings = fileSizeFindings([{
    path: "src/background.js",
    lineCount: 930
  }]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "hard");
});

test("tracks folder density with the same baseline rule", () => {
  const insideBaseline = folderDensityFindings([{
    path: "src",
    fileCount: 24
  }]);
  const pastBaseline = folderDensityFindings([{
    path: "src",
    fileCount: 25
  }]);

  assert.equal(insideBaseline[0].severity, "notice");
  assert.equal(pastBaseline[0].severity, "hard");
});
