export function renderAdminPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SayThis Moderator</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f8fafc;
      color: #18212f;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: #f8fafc;
    }

    main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }

    header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 24px;
    }

    h1,
    h2,
    p {
      margin: 0;
    }

    h1 {
      font-size: 28px;
      line-height: 1.15;
    }

    h2 {
      font-size: 18px;
      line-height: 1.25;
    }

    .muted {
      color: #526071;
      font-size: 14px;
      margin-top: 6px;
    }

    .panel,
    .entry {
      background: #fff;
      border: 1px solid #d8dee8;
      border-radius: 8px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    }

    .panel {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) minmax(260px, 2fr) auto;
      gap: 12px;
      align-items: end;
      padding: 16px;
      margin-bottom: 18px;
    }

    label {
      display: grid;
      gap: 6px;
      color: #344054;
      font-size: 13px;
      font-weight: 600;
    }

    input,
    textarea,
    select {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #fff;
      color: #111827;
      font: inherit;
      font-size: 14px;
      padding: 9px 10px;
    }

    textarea {
      min-height: 84px;
      resize: vertical;
    }

    button {
      border: 1px solid #1f2937;
      border-radius: 6px;
      background: #1f2937;
      color: #fff;
      cursor: pointer;
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      min-height: 39px;
      padding: 8px 13px;
    }

    button.secondary {
      background: #fff;
      color: #1f2937;
    }

    button.danger {
      border-color: #b42318;
      background: #b42318;
    }

    button:disabled {
      cursor: wait;
      opacity: 0.65;
    }

    .status {
      min-height: 20px;
      color: #344054;
      font-size: 14px;
      margin-bottom: 14px;
    }

    .list {
      display: grid;
      gap: 14px;
    }

    .entry {
      display: grid;
      gap: 14px;
      padding: 16px;
    }

    .entry-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }

    .pill {
      align-self: start;
      border: 1px solid #d0d5dd;
      border-radius: 999px;
      color: #344054;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 9px;
      text-transform: uppercase;
    }

    dl {
      display: grid;
      grid-template-columns: repeat(4, minmax(120px, 1fr));
      gap: 12px;
      margin: 0;
    }

    dt {
      color: #526071;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }

    dd {
      margin: 4px 0 0;
      overflow-wrap: anywhere;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(180px, 1fr));
      gap: 12px;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: end;
    }

    .empty {
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      color: #526071;
      padding: 24px;
      text-align: center;
    }

    @media (max-width: 760px) {
      header,
      .entry-head {
        display: grid;
      }

      .panel,
      .grid,
      dl {
        grid-template-columns: 1fr;
      }

      .actions {
        justify-content: stretch;
      }

      button {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>SayThis Moderator</h1>
        <p class="muted">Review pending pronunciation submissions and publish approved entries.</p>
      </div>
    </header>

    <section class="panel" aria-label="Connection">
      <label>
        Service URL
        <input id="service-url" autocomplete="url" value="">
      </label>
      <label>
        Admin token
        <input id="admin-token" autocomplete="off" type="password" value="">
      </label>
      <button id="load-button" type="button">Load Pending</button>
    </section>

    <p id="status" class="status" role="status"></p>
    <section id="pending-list" class="list" aria-live="polite"></section>
  </main>

  <template id="entry-template">
    <article class="entry">
      <div class="entry-head">
        <div>
          <h2 data-field="term"></h2>
          <p class="muted" data-field="id"></p>
        </div>
        <span class="pill" data-field="kind"></span>
      </div>
      <dl>
        <div>
          <dt>Lookup key</dt>
          <dd data-field="lookupKey"></dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd data-field="createdAt"></dd>
        </div>
        <div>
          <dt>Source form</dt>
          <dd data-field="sourceForm"></dd>
        </div>
        <div>
          <dt>Language</dt>
          <dd data-field="language"></dd>
        </div>
      </dl>
      <div class="grid">
        <label>
          Source form
          <input data-input="sourceForm">
        </label>
        <label>
          Aliases
          <input data-input="aliases">
        </label>
        <label>
          Language code
          <input data-input="language">
        </label>
        <label>
          Language name
          <input data-input="languageName">
        </label>
        <label>
          Origin
          <input data-input="origin">
        </label>
        <label>
          Root
          <input data-input="root">
        </label>
        <label>
          IPA
          <input data-input="ipa">
        </label>
        <label>
          Simple guide
          <input data-input="simple">
        </label>
        <label>
          Audio URL
          <input data-input="audioUrl" type="url">
        </label>
        <label>
          Source URL
          <input data-input="sourceUrl" type="url">
        </label>
        <label>
          Trust signals
          <input data-input="trustSignals">
        </label>
        <label>
          Variant note
          <input data-input="variantNote">
        </label>
      </div>
      <label>
        Reject reason
        <textarea data-input="rejectReason"></textarea>
      </label>
      <div class="actions">
        <button type="button" data-action="approve">Approve</button>
        <button type="button" class="danger" data-action="reject">Reject</button>
      </div>
    </article>
  </template>

  <script>
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
        origin: entry.correction?.origin || "",
        root: entry.correction?.root || entry.result?.root || "",
        ipa: entry.correction?.ipa || "",
        simple: entry.correction?.simple || "",
        audioUrl: entry.correction?.audioUrl || "",
        sourceUrl: entry.correction?.sourceUrl || "",
        trustSignals: trustSignalsText(entry),
        variantNote: entry.correction?.variantNote || "",
        rejectReason: ""
      };

      for (const [name, value] of Object.entries(fields)) {
        const input = article.querySelector(\`[data-input="\${name}"]\`);
        if (input) {
          input.value = value;
        }
      }

      article.querySelector('[data-action="approve"]').addEventListener("click", () => approveEntry(entry, article));
      article.querySelector('[data-action="reject"]').addEventListener("click", () => rejectEntry(entry, article));
      return article;
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
      for (const name of ["sourceForm", "aliases", "language", "languageName", "origin", "root", "ipa", "simple", "audioUrl", "sourceUrl", "trustSignals", "variantNote"]) {
        const value = article.querySelector(\`[data-input="\${name}"]\`)?.value.trim();
        if (value) {
          entry[name] = value;
        }
      }
      return entry;
    }

    async function requestJson(path, options = {}) {
      const base = serviceUrlInput.value.trim() || location.origin;
      const response = await fetch(new URL(path, base), {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "Authorization": \`Bearer \${tokenInput.value.trim()}\`,
          ...(options.headers || {})
        }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || \`Request failed with status \${response.status}\`);
      }
      return body;
    }

    function setText(root, field, value) {
      const node = root.querySelector(\`[data-field="\${field}"]\`);
      if (node) {
        node.textContent = value || "-";
      }
    }

    function aliasesText(value) {
      return Array.isArray(value) ? value.filter(Boolean).join("; ") : "";
    }

    function trustSignalsText(entry) {
      const correction = entry.correction || {};
      const result = entry.result || {};
      const signals = ["moderator-reviewed"];

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
  </script>
</body>
</html>`;
}
