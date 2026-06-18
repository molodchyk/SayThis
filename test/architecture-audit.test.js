import assert from "node:assert/strict";
import test from "node:test";
import {
  chromeApiBoundaryFindings,
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
  }, {
    fileBaseline: {
      "src/background.js": 929
    }
  });

  assert.equal(audit.ok, true);
  assert.equal(audit.fileFindings.length, 1);
  assert.equal(audit.fileFindings[0].severity, "notice");
  assert.equal(audit.fileFindings[0].baseline, 929);
});

test("fails when a large file grows past its baseline", () => {
  const findings = fileSizeFindings([{
    path: "src/background.js",
    lineCount: 901
  }]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "hard");
});

test("tracks folder density with the same baseline rule", () => {
  const insideBaseline = folderDensityFindings([{
    path: "test",
    fileCount: 19
  }]);
  const pastBaseline = folderDensityFindings([{
    path: "test",
    fileCount: 21
  }]);

  assert.equal(insideBaseline[0].severity, "notice");
  assert.equal(pastBaseline[0].severity, "hard");
});

test("keeps Chrome APIs behind runtime adapter boundaries", () => {
  const findings = chromeApiBoundaryFindings([{
    path: "src/popup/index.js",
    line: 12,
    match: "chrome.runtime"
  }, {
    path: "src/popup/runtime-adapters.js",
    line: 1,
    match: "globalThis.chrome"
  }, {
    path: "test/popup/runtime-adapters.test.js",
    line: 1,
    match: "chrome.runtime"
  }]);

  assert.deepEqual(findings, [{
    type: "chrome-api-boundary",
    severity: "hard",
    path: "src/popup/index.js",
    line: 12,
    match: "chrome.runtime",
    message: "Chrome API access belongs in runtime adapter or platform modules."
  }]);
});
