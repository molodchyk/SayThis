export const ADMIN_PAGE_SCRIPT = String.raw`
const serviceUrlInput = document.querySelector("#service-url");
const tokenInput = document.querySelector("#admin-token");
const loadButton = document.querySelector("#load-button");
const statusNode = document.querySelector("#status");
const listNode = document.querySelector("#pending-list");
const template = document.querySelector("#entry-template");

serviceUrlInput.value = location.origin;

loadButton.addEventListener("click", () => loadPending());

async function loadPending() {
  setBusy(true);
  setStatus("Loading pending submissions.");
  try {
    const payload = await requestJson("/admin/pending");
    renderPending(payload.pending || []);
    setStatus((payload.pending || []).length ? "Pending submissions loaded." : "No pending submissions.");
  } catch (error) {
    setStatus(error.message || "Could not load pending submissions.");
  } finally {
    setBusy(false);
  }
}

function renderPending(entries) {
  listNode.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No pending submissions.";
    listNode.append(empty);
    return;
  }

  for (const entry of entries) {
    listNode.append(renderEntry(entry));
  }
}

function renderEntry(entry) {
  const fragment = template.content.cloneNode(true);
  const article = fragment.querySelector(".entry");
  setText(article, "term", entry.term || "Untitled submission");
  setText(article, "id", entry.id || "");
  setText(article, "kind", entry.kind || "");
  setText(article, "lookupKey", entry.lookupKey || "");
  setText(article, "createdAt", entry.createdAt || entry.receivedAt || "");
  setText(article, "sourceForm", entry.correction?.sourceForm || entry.result?.sourceForm || "");
  setText(article, "language", entry.correction?.languageName || entry.correction?.language || entry.result?.languageName || entry.result?.language || "");

  const fields = {
    sourceForm: entry.correction?.sourceForm || entry.result?.sourceForm || entry.term || "",
    aliases: aliasesText(entry.correction?.aliases),
    language: entry.correction?.language || entry.result?.language || "",
    languageName: entry.correction?.languageName || entry.result?.languageName || "",
    ttsLang: entry.correction?.ttsLang || entry.result?.ttsLang || entry.correction?.language || entry.result?.language || "",
    voiceName: "",
    rate: "",
    origin: entry.correction?.origin || "",
    root: entry.correction?.root || entry.result?.root || "",
    domainHint: entry.correction?.domainHint || entry.result?.domainHint || "",
    variants: variantsText(entry.correction?.variants || entry.result?.variants),
    ipa: entry.correction?.ipa || "",
    simple: entry.correction?.simple || "",
    audioUrl: entry.correction?.audioUrl || "",
    sourceUrl: entry.correction?.sourceUrl || "",
    trustSignals: trustSignalsText(entry),
    variantNote: entry.correction?.variantNote || "",
    rejectReason: ""
  };

  for (const [name, value] of Object.entries(fields)) {
    const input = article.querySelector('[data-input="' + name + '"]');
    if (input) {
      input.value = value;
    }
  }

  article.querySelector('[data-action="generate"]').addEventListener("click", () => generateAudioEntry(entry, article));
  article.querySelector('[data-action="approve"]').addEventListener("click", () => approveEntry(entry, article));
  article.querySelector('[data-action="reject"]').addEventListener("click", () => rejectEntry(entry, article));
  return article;
}

async function generateAudioEntry(entry, article) {
  setBusy(true, article);
  try {
    const fields = collectFields(article);
    const response = await requestJson("/admin/generate-audio-artifact", {
      method: "POST",
      body: JSON.stringify(collectGenerationFields(entry, article, fields))
    });
    article.remove();
    setStatus(response.artifact?.audioUrl ? "Generated audio approved." : "Generated audio request accepted.");
    showEmptyIfNeeded();
  } catch (error) {
    setStatus(error.message || "Could not generate audio.");
  } finally {
    setBusy(false, article);
  }
}

async function approveEntry(entry, article) {
  setBusy(true, article);
  try {
    const fields = collectFields(article);
    await requestJson("/admin/approve", {
      method: "POST",
      body: JSON.stringify({
        id: entry.id,
        entry: fields
      })
    });
    article.remove();
    setStatus("Submission approved.");
    showEmptyIfNeeded();
  } catch (error) {
    setStatus(error.message || "Could not approve submission.");
  } finally {
    setBusy(false, article);
  }
}

async function rejectEntry(entry, article) {
  setBusy(true, article);
  try {
    const reason = article.querySelector('[data-input="rejectReason"]').value.trim();
    await requestJson("/admin/reject", {
      method: "POST",
      body: JSON.stringify({
        id: entry.id,
        reason
      })
    });
    article.remove();
    setStatus("Submission rejected.");
    showEmptyIfNeeded();
  } catch (error) {
    setStatus(error.message || "Could not reject submission.");
  } finally {
    setBusy(false, article);
  }
}

function collectFields(article) {
  const entry = {};
  for (const name of ["sourceForm", "aliases", "language", "languageName", "origin", "root", "domainHint", "variants", "ipa", "simple", "audioUrl", "sourceUrl", "trustSignals", "variantNote"]) {
    const value = article.querySelector('[data-input="' + name + '"]')?.value.trim();
    if (value) {
      entry[name] = value;
    }
  }
  return entry;
}

function collectGenerationFields(entry, article, fields) {
  const rate = Number(article.querySelector('[data-input="rate"]')?.value.trim() || "");
  const payload = {
    id: entry.id,
    term: entry.term,
    lookupKey: entry.lookupKey,
    sourceForm: fields.sourceForm || entry.term,
    language: fields.language,
    ttsLang: article.querySelector('[data-input="ttsLang"]')?.value.trim() || fields.language,
    voiceName: article.querySelector('[data-input="voiceName"]')?.value.trim(),
    sourceUrl: fields.sourceUrl
  };
  if (Number.isFinite(rate) && rate > 0) {
    payload.rate = rate;
  }
  return payload;
}

async function requestJson(path, options = {}) {
  const base = serviceUrlInput.value.trim() || location.origin;
  const response = await fetch(new URL(path, base), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + tokenInput.value.trim(),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Request failed with status " + response.status);
  }
  return body;
}

function setText(root, field, value) {
  const node = root.querySelector('[data-field="' + field + '"]');
  if (node) {
    node.textContent = value || "-";
  }
}

function aliasesText(value) {
  return Array.isArray(value) ? value.filter(Boolean).join("; ") : "";
}

function variantsText(value) {
  return Array.isArray(value) ? value.filter(Boolean).join("; ") : "";
}

function trustSignalsText(entry) {
  const correction = entry.correction || {};
  const result = entry.result || {};
  const signals = ["moderator-reviewed", ...(Array.isArray(result.trustSignals) ? result.trustSignals : [])];

  if (correction.sourceUrl) {
    signals.push("source-backed");
  }
  if (correction.audioUrl || result.sourceStatus === "verified-audio") {
    signals.push("audio-backed");
  }
  if (entry.kind === "correction") {
    signals.push("correction-reviewed");
  }
  if (entry.kind === "confirm") {
    signals.push("contributor-confirmed");
  }
  if (result.sourceStatus && result.sourceStatus !== "unknown") {
    signals.push(result.sourceStatus);
  }

  return [...new Set(signals.filter(Boolean))].join("; ");
}

function setStatus(message) {
  statusNode.textContent = message || "";
}

function setBusy(isBusy, scope = document) {
  const buttons = scope.querySelectorAll("button");
  for (const button of buttons) {
    button.disabled = isBusy;
  }
}

function showEmptyIfNeeded() {
  if (!listNode.querySelector(".entry")) {
    renderPending([]);
  }
}
`;
