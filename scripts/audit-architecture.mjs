import { readdir, readFile, stat } from "node:fs/promises";
import { posix } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_ROOTS = [
  "README.md",
  "docs",
  "manifest.json",
  "package.json",
  "scripts",
  "server",
  "src",
  "test"
];
const AUDITED_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs"
]);
const DEFAULT_FILE_BASELINE = {
  "src/background.js": 929
};
const DEFAULT_FOLDER_BASELINE = {
  src: 24,
  test: 21
};

export const DEFAULT_AUDIT_OPTIONS = {
  roots: DEFAULT_ROOTS,
  fileSoftLimit: 600,
  fileHardLimit: 900,
  folderSoftLimit: 12,
  folderHardLimit: 20,
  fileBaseline: DEFAULT_FILE_BASELINE,
  folderBaseline: DEFAULT_FOLDER_BASELINE
};

export async function collectArchitectureAuditInputs(root = process.cwd(), options = {}) {
  const normalizedOptions = normalizeAuditOptions(options);
  const files = [];
  const folders = [];

  for (const entry of normalizedOptions.roots) {
    const relativePath = normalizeAuditPath(entry);
    const absolutePath = joinRoot(root, relativePath);
    let stats;

    try {
      stats = await stat(absolutePath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      await walkDirectory(root, relativePath, files, folders);
    } else if (isAuditedFile(relativePath)) {
      files.push({
        path: relativePath,
        lineCount: countLines(await readFile(absolutePath, "utf8"))
      });
    }
  }

  return {
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    folders: folders.sort((left, right) => left.path.localeCompare(right.path))
  };
}

export function createArchitectureAudit(inputs = {}, options = {}) {
  const normalizedOptions = normalizeAuditOptions(options);
  const fileFindings = fileSizeFindings(inputs.files || [], normalizedOptions);
  const folderFindings = folderDensityFindings(inputs.folders || [], normalizedOptions);
  const findings = [...fileFindings, ...folderFindings];

  return {
    ok: findings.every((finding) => finding.severity !== "hard"),
    fileFindings,
    folderFindings,
    findings
  };
}

export function fileSizeFindings(files = [], options = {}) {
  const normalizedOptions = normalizeAuditOptions(options);
  return files
    .map((file) => {
      const path = normalizeAuditPath(file.path);
      const lineCount = Number(file.lineCount || 0);
      const baseline = Number(normalizedOptions.fileBaseline[path] || 0);
      const limit = normalizedOptions.fileHardLimit;

      if (lineCount > limit) {
        return {
          type: "file-size",
          severity: lineCount > Math.max(limit, baseline) ? "hard" : "notice",
          path,
          count: lineCount,
          limit,
          baseline
        };
      }

      if (lineCount > normalizedOptions.fileSoftLimit) {
        return {
          type: "file-size",
          severity: "notice",
          path,
          count: lineCount,
          limit: normalizedOptions.fileSoftLimit,
          baseline
        };
      }

      return null;
    })
    .filter(Boolean);
}

export function folderDensityFindings(folders = [], options = {}) {
  const normalizedOptions = normalizeAuditOptions(options);
  return folders
    .map((folder) => {
      const path = normalizeAuditPath(folder.path);
      const fileCount = Number(folder.fileCount || 0);
      const baseline = Number(normalizedOptions.folderBaseline[path] || 0);
      const limit = normalizedOptions.folderHardLimit;

      if (fileCount > limit) {
        return {
          type: "folder-density",
          severity: fileCount > Math.max(limit, baseline) ? "hard" : "notice",
          path,
          count: fileCount,
          limit,
          baseline
        };
      }

      if (fileCount > normalizedOptions.folderSoftLimit) {
        return {
          type: "folder-density",
          severity: "notice",
          path,
          count: fileCount,
          limit: normalizedOptions.folderSoftLimit,
          baseline
        };
      }

      return null;
    })
    .filter(Boolean);
}

export function countLines(text = "") {
  const normalized = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized) {
    return 0;
  }

  const trimmed = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return trimmed ? trimmed.split("\n").length : 0;
}

export function normalizeAuditPath(path) {
  return String(path || "").replaceAll("\\", "/").replace(/^\/+/, "");
}

function normalizeAuditOptions(options = {}) {
  return {
    ...DEFAULT_AUDIT_OPTIONS,
    ...options,
    roots: options.roots || DEFAULT_AUDIT_OPTIONS.roots,
    fileBaseline: {
      ...DEFAULT_AUDIT_OPTIONS.fileBaseline,
      ...(options.fileBaseline || {})
    },
    folderBaseline: {
      ...DEFAULT_AUDIT_OPTIONS.folderBaseline,
      ...(options.folderBaseline || {})
    }
  };
}

async function walkDirectory(root, directoryPath, files, folders) {
  const absolutePath = joinRoot(root, directoryPath);
  const entries = await readdir(absolutePath, { withFileTypes: true });
  let directFileCount = 0;

  for (const entry of entries) {
    const relativePath = posix.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(root, relativePath, files, folders);
    } else if (entry.isFile() && isAuditedFile(relativePath)) {
      directFileCount += 1;
      files.push({
        path: relativePath,
        lineCount: countLines(await readFile(joinRoot(root, relativePath), "utf8"))
      });
    }
  }

  folders.push({
    path: directoryPath,
    fileCount: directFileCount
  });
}

function isAuditedFile(path) {
  return AUDITED_EXTENSIONS.has(posix.extname(normalizeAuditPath(path)));
}

function formatFinding(finding) {
  const baseline = finding.baseline ? `, baseline ${finding.baseline}` : "";
  const unit = finding.type === "file-size" ? "lines" : "files";
  return `${finding.severity.toUpperCase()} ${finding.type}: ${finding.path} has ${finding.count} ${unit}; limit ${finding.limit}${baseline}`;
}

function printAudit(audit) {
  if (!audit.findings.length) {
    console.log("architecture audit clean");
    return;
  }

  for (const finding of audit.findings) {
    console.log(formatFinding(finding));
  }
}

function joinRoot(root, ...parts) {
  return posix.join(String(root).replaceAll("\\", "/"), ...parts);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputs = await collectArchitectureAuditInputs();
  const audit = createArchitectureAudit(inputs);
  printAudit(audit);
  if (!audit.ok) {
    process.exitCode = 1;
  }
}
