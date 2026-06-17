(function installSayThisOverlay() {
  if (window.__sayThisOverlayReady) {
    return;
  }
  window.__sayThisOverlayReady = true;

  let host;
  let root;
  let audioPlayer;
  const overlayStyles = globalThis.__sayThisOverlayStyles || "";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "SAYTHIS_SHOW_RESULT") {
      return false;
    }

    renderOverlay(message.result, { autoPlay: Boolean(message.autoPlay) });
    sendResponse({ ok: true });
    return true;
  });

  function renderOverlay(result, options = {}) {
    if (!result) {
      return;
    }

    ensureRoot();
    const evidence = [
      ...trustSignalItems(result.trustSignals),
      ...(result.evidence || []),
      result.root ? `Root: ${result.root}` : "",
      ...variantItems(result.variants),
      result.notes || result.variantNote || ""
    ].filter(Boolean).slice(0, 2);
    const sources = sourceItems(result).slice(0, 2);
    const alternates = alternateItems(result).slice(0, 2);
    const recordings = audioItems(result).slice(0, 4);
    const community = result.community || {};
    const communityText = [
      community.confirmations ? `${community.confirmations} confirmation${community.confirmations === 1 ? "" : "s"}` : "",
      community.corrections ? `${community.corrections} correction${community.corrections === 1 ? "" : "s"}` : "",
      community.requests ? `${community.requests} request${community.requests === 1 ? "" : "s"}` : "",
      community.flags ? `${community.flags} wrong-result flag${community.flags === 1 ? "" : "s"}` : ""
    ].filter(Boolean).join(" · ");

    root.innerHTML = `
      <style>${overlayStyles}</style>
      <article class="card" role="dialog" aria-label="SayThis pronunciation result">
        <div class="head">
          <div>
            <span class="eyebrow">SayThis</span>
            <h2>${escapeHtml(result.display || result.query || "Unknown")}</h2>
          </div>
          <button class="close" type="button" aria-label="Close">×</button>
        </div>
        <div class="badges">
          <span class="badge">${escapeHtml(result.confidence || "unknown")}</span>
          <span class="badge subtle">${escapeHtml(result.sourceLabel || result.sourceStatus || "Unknown")}</span>
        </div>
        <dl>
          <div>
            <dt>Source</dt>
            <dd>${escapeHtml(result.sourceForm || "Unknown")}</dd>
          </div>
          <div>
            <dt>Aliases</dt>
            <dd>${escapeHtml(aliasesTextFromResult(result) || "None")}</dd>
          </div>
          <div>
            <dt>Language</dt>
            <dd>${escapeHtml(result.languageName || result.language || "Unknown")}</dd>
          </div>
          <div>
            <dt>Root</dt>
            <dd>${escapeHtml(result.root || "Unknown")}</dd>
          </div>
          <div>
            <dt>IPA</dt>
            <dd>${escapeHtml(result.pronunciation?.ipa || "Not available")}</dd>
          </div>
          <div>
            <dt>Guide</dt>
            <dd>${escapeHtml(result.pronunciation?.simple || "Not available")}</dd>
          </div>
        </dl>
        <ul class="evidence">
          ${evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          ${communityText ? `<li>${escapeHtml(communityText)}</li>` : ""}
        </ul>
        ${alternates.length ? `<ul class="alternates">${alternates.map((item) => `<li><button type="button" data-action="alternate" data-alternate-index="${item.index}">Speak</button><strong>${escapeHtml(item.display || "Alternate")}</strong><span>${escapeHtml(item.summary)}</span></li>`).join("")}</ul>` : ""}
        ${recordings.length ? `<ul class="recordings" aria-label="Pronunciation recordings">${recordings.map((item, index) => `<li><button type="button" data-action="recording" data-audio-index="${index}">Play</button><span>${escapeHtml(item.label || "Pronunciation audio")}</span></li>`).join("")}</ul>` : ""}
        ${sources.length ? `<ul class="sources">${sources.map((item) => `<li><a href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)}</a></li>`).join("")}</ul>` : ""}
        <label class="hint-field">
          <span>Lookup hints</span>
          <input data-lookup-hints type="text" maxlength="80" value="${escapeAttribute(options.lookupHints || "")}" placeholder="pl, tr, ja" spellcheck="false">
        </label>
        <div class="actions">
          <button class="action" type="button" data-action="speak">Speak</button>
          <button class="action secondary" type="button" data-action="online">Online</button>
          <button class="action secondary" type="button" data-action="slow">Slow</button>
          <button class="action secondary" type="button" data-action="correct">Correct</button>
          <button class="action secondary" type="button" data-action="confirm">Confirm</button>
          <button class="action secondary" type="button" data-action="missing">Missing</button>
          <button class="action secondary" type="button" data-action="wrong">Wrong</button>
        </div>
        <form class="correction-panel" data-correction hidden>
          <div class="correction-grid">
            ${correctionInput("Source", "sourceForm", result.sourceForm, 160)}
            ${correctionInput("Aliases", "aliases", aliasesTextFromResult(result), 240)}
            ${correctionInput("Language", "language", result.language, 24)}
            ${correctionInput("Language name", "languageName", result.languageName, 80)}
            ${correctionInput("Guide", "simple", result.pronunciation?.simple, 120)}
            ${correctionInput("IPA", "ipa", result.pronunciation?.ipa, 120)}
            ${correctionInput("Origin", "origin", result.origin, 160, "full")}
            ${correctionInput("Root", "root", result.root, 160, "full")}
            ${correctionInput("Audio source", "audioUrl", getBestAudio(result)?.url, 2048, "full", "url")}
            ${correctionInput("Source link", "sourceUrl", firstSourceUrl(result), 2048, "full", "url")}
            ${correctionInput("Variant note", "variantNote", result.notes || result.variantNote, 160, "full")}
          </div>
          <div class="form-actions">
            <button class="action" type="submit">Save</button>
            <button class="action secondary" type="button" data-action="cancel-correction">Cancel</button>
          </div>
        </form>
        <p class="status" aria-live="polite"></p>
      </article>
    `;

    root.querySelector(".close").addEventListener("click", () => {
      stopAudio();
      host.remove();
      host = null;
      root = null;
    });

    root.querySelector('[data-action="speak"]').addEventListener("click", () => speak(result, 0.82));
    root.querySelector('[data-action="online"]').addEventListener("click", () => resolveOnline(result));
    root.querySelector('[data-action="slow"]').addEventListener("click", () => speak(result, 0.62));
    root.querySelector('[data-action="correct"]').addEventListener("click", () => toggleCorrection());
    root.querySelector('[data-action="confirm"]').addEventListener("click", () => sendFeedback(result, "confirm"));
    root.querySelector('[data-action="missing"]').addEventListener("click", () => sendFeedback(result, "missing", correctionFeedbackFromForm("missing")));
    root.querySelector('[data-action="wrong"]').addEventListener("click", () => sendFeedback(result, "wrong"));
    for (const button of root.querySelectorAll('[data-action="alternate"]')) {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.alternateIndex);
        speakCandidate(result.alternateResults?.[index], 0.82);
      });
    }
    for (const button of root.querySelectorAll('[data-action="recording"]')) {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.audioIndex);
        if (playAudioItem(recordings[index], result, 0.82)) {
          setStatus("Playing recording.");
        }
      });
    }
    root.querySelector('[data-action="cancel-correction"]').addEventListener("click", () => toggleCorrection(false));
    root.querySelector("[data-correction]").addEventListener("submit", (event) => {
      event.preventDefault();
      sendCorrection(result);
    });

    if (options.autoPlay) {
      speak(result, 0.82);
    }
  }

  function correctionInput(label, field, value, maxLength, className = "", type = "text") {
    return `
      <label class="${escapeAttribute(className)}">
        <span>${escapeHtml(label)}</span>
        <input data-correction-field="${escapeAttribute(field)}" type="${escapeAttribute(type)}" maxlength="${maxLength}" value="${escapeAttribute(value || "")}" spellcheck="false">
      </label>
    `;
  }

  function resolveOnline(result) {
    const languageHints = lookupHints();
    setStatus("Checking online sources.");
    chrome.runtime.sendMessage({
      type: "SAYTHIS_RESOLVE",
      text: result.query || result.display,
      useOnline: true,
      languageHints
    }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        setStatus(response?.error || chrome.runtime.lastError?.message || "Online lookup failed.");
        return;
      }

      renderOverlay(response.result || result, { autoPlay: true, lookupHints: languageHints.join(", ") });
      setStatus("Online result ready.");
    });
  }

  function sendFeedback(result, kind, feedback = { kind }) {
    setStatus("Saving.");

    chrome.runtime.sendMessage({
      type: "SAYTHIS_FEEDBACK",
      text: result.query || result.display,
      feedback
    }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        setStatus(response?.error || chrome.runtime.lastError?.message || "Could not save.");
        return;
      }

      renderOverlay(response.result || result);
      setStatus("Saved.");
    });
  }

  function toggleCorrection(force) {
    const form = root?.querySelector("[data-correction]");
    if (!form) {
      return;
    }

    form.hidden = typeof force === "boolean" ? !force : !form.hidden;
    if (!form.hidden) {
      form.querySelector("[data-correction-field]")?.focus();
    }
  }

  function sendCorrection(result) {
    const feedback = correctionFeedbackFromForm("correction");
    if (!hasCorrectionDetail(feedback)) {
      setStatus("Add correction details.");
      return;
    }

    setStatus("Saving.");
    chrome.runtime.sendMessage({
      type: "SAYTHIS_FEEDBACK",
      text: result.query || result.display,
      feedback
    }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        setStatus(response?.error || chrome.runtime.lastError?.message || "Could not save.");
        return;
      }

      renderOverlay(response.result || result);
      setStatus("Saved.");
    });
  }

  function correctionFeedbackFromForm(kind) {
    const feedback = { kind };
    for (const input of root?.querySelectorAll("[data-correction-field]") || []) {
      const field = input.dataset.correctionField;
      if (field === "aliases") {
        feedback[field] = normalizeAliases(input.value);
      } else if (field === "audioUrl" || field === "sourceUrl") {
        feedback[field] = normalizeLongText(input.value);
      } else {
        feedback[field] = normalizeText(input.value);
      }
    }
    return feedback;
  }

  function hasCorrectionDetail(feedback) {
    return ["sourceForm", "language", "languageName", "origin", "root", "ipa", "simple", "audioUrl", "sourceUrl", "variantNote"]
      .some((field) => Boolean(feedback[field])) ||
      Boolean(normalizeAliases(feedback.aliases).length);
  }

  function lookupHints() {
    const input = root?.querySelector("[data-lookup-hints]");
    return normalizeLanguageHints(input?.value);
  }

  function setStatus(value) {
    const status = root?.querySelector(".status");
    if (status) {
      status.textContent = value;
    }
  }

  function ensureRoot() {
    if (host && root) {
      return;
    }

    host = document.createElement("saythis-overlay");
    root = host.attachShadow({ mode: "open" });
    document.documentElement.append(host);
  }

  function speak(result, rate) {
    if (playAudio(result, rate)) {
      return;
    }

    speakCandidate(result, rate);
  }

  function speakCandidate(result, rate) {
    if (!result) {
      return;
    }

    chrome.runtime.sendMessage({
      type: "SAYTHIS_SPEAK",
      text: result.query || result.sourceForm || result.display,
      result,
      rate
    });
  }

  function playAudio(result, rate) {
    const audio = getBestAudio(result);
    return playAudioItem(audio, result, rate);
  }

  function playAudioItem(audio, result, rate) {
    if (!audio?.url) {
      return false;
    }

    let fallbackStarted = false;
    const fallbackToSpeech = () => {
      if (fallbackStarted) {
        return;
      }

      fallbackStarted = true;
      setStatus("Audio failed. Using TTS fallback.");
      chrome.runtime.sendMessage({
        type: "SAYTHIS_SPEAK",
        text: result.query || result.display,
        result,
        rate
      });
    };

    stopAudio();
    audioPlayer = new Audio(audio.url);
    audioPlayer.playbackRate = rate < 0.7 ? 0.75 : 1;
    audioPlayer.addEventListener("error", () => {
      fallbackToSpeech();
    });
    audioPlayer.play().catch(() => {
      fallbackToSpeech();
    });
    return true;
  }

  function stopAudio() {
    if (!audioPlayer) {
      return;
    }

    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer = null;
  }

  function getBestAudio(result) {
    const audio = result?.pronunciation?.audio;
    if (!Array.isArray(audio) || !audio.length) {
      return null;
    }

    return audio.find((item) => item?.url && item.quality === "verified") || audio.find((item) => item?.url) || null;
  }

  function sourceItems(result) {
    const sources = Array.isArray(result?.sources) ? result.sources : [];
    const audio = Array.isArray(result?.pronunciation?.audio)
      ? result.pronunciation.audio.map((item) => ({
        label: item.label || item.source || "Pronunciation audio",
        url: item.url
      }))
      : [];
    const seen = new Set();
    const items = [];

    for (const item of [...sources, ...audio]) {
      const source = normalizeSourceItem(item);
      if (!source.url || seen.has(source.url)) {
        continue;
      }

      seen.add(source.url);
      items.push(source);
    }

    return items;
  }

  function audioItems(result) {
    const audio = Array.isArray(result?.pronunciation?.audio) ? result.pronunciation.audio : [];
    const seen = new Set();
    const items = [];

    for (const item of audio) {
      const normalized = normalizeAudioItem(item);
      if (!normalized.url || seen.has(normalized.url)) {
        continue;
      }

      seen.add(normalized.url);
      items.push(normalized);
    }

    return items;
  }

  function firstSourceUrl(result) {
    const source = (Array.isArray(result?.sources) ? result.sources : [])
      .find((item) => normalizeUrl(item?.url));
    return normalizeUrl(source?.url);
  }

  function aliasesTextFromResult(result = {}) {
    const aliases = normalizeAliases(result.aliases);
    const query = normalizeText(result.query);
    const sourceForm = normalizeText(result.sourceForm || result.display);
    if (query && sourceForm && query.toLocaleLowerCase() !== sourceForm.toLocaleLowerCase()) {
      aliases.unshift(query);
    }

    return [...new Set(aliases)].join("; ");
  }

  function trustSignalItems(value) {
    return normalizeTrustSignals(value)
      .map((item) => `Trust: ${item}`);
  }

  function variantItems(value) {
    return normalizeTrustSignals(value)
      .map((item) => `Variant: ${item}`);
  }

  function alternateItems(result) {
    const alternates = Array.isArray(result?.alternateResults) ? result.alternateResults : [];
    return alternates
      .map((item, index) => {
        const sourceForm = normalizeText(item.sourceForm || item.display || item.query);
        const language = normalizeText(item.languageName || item.language);
        const source = normalizeText(item.sourceLabel || item.sourceStatus || item.confidence);
        const guide = normalizeText(item.pronunciation?.simple || item.pronunciation?.ipa);
        return {
          index,
          display: normalizeText(item.display || sourceForm),
          summary: [sourceForm, language, source, guide].filter(Boolean).join(" · ")
        };
      })
      .filter((item) => item.display || item.summary);
  }

  function normalizeSourceItem(item) {
    const url = normalizeUrl(item?.url);
    return {
      label: String(item?.label || item?.source || hostLabel(url) || "Source").trim().slice(0, 160),
      url
    };
  }

  function normalizeAudioItem(item) {
    const url = normalizeUrl(item?.url);
    return {
      label: normalizeText(item?.label || item?.source || hostLabel(url) || "Pronunciation audio"),
      url
    };
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
  }

  function normalizeLongText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 2048);
  }

  function normalizeAliases(value) {
    const raw = Array.isArray(value)
      ? value
      : String(value || "").split(/[;,\n]/);

    return [...new Set(raw.map(normalizeText).filter(Boolean))].slice(0, 12);
  }

  function normalizeTrustSignals(value) {
    const raw = Array.isArray(value)
      ? value
      : String(value || "").split(/[;,\n]/);

    return [...new Set(raw.map(normalizeText).filter(Boolean))].slice(0, 12);
  }

  function normalizeLanguageHints(value) {
    const raw = Array.isArray(value)
      ? value
      : String(value || "").split(/[\s,;]+/);

    return [...new Set(raw
      .map((item) => String(item || "").trim().toLowerCase().replace(/_/g, "-").split("-")[0])
      .filter((item) => /^[a-z]{2,3}$/.test(item)))]
      .slice(0, 8);
  }

  function normalizeUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }

    try {
      const url = new URL(raw);
      if (["https:", "chrome-extension:"].includes(url.protocol)) {
        return url.toString();
      }
    } catch {
      return "";
    }

    return "";
  }

  function hostLabel(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }
})();
