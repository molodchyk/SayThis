(function installSayThisOverlayResultView() {
  if (globalThis.__sayThisOverlayResultView) {
    return;
  }

  function correctionInput(label, field, value, maxLength, className = "", type = "text") {
    return `
      <label class="${escapeAttribute(className)}">
        <span>${escapeHtml(label)}</span>
        <input data-correction-field="${escapeAttribute(field)}" type="${escapeAttribute(type)}" maxlength="${maxLength}" value="${escapeAttribute(value || "")}" spellcheck="false">
      </label>
    `;
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

  function playbackItems(result) {
    const audio = audioItems(result).map((item) => ({ ...item, kind: "audio" }));
    const speech = sourceSpeechItem(result);
    const guide = normalizeText(result?.pronunciation?.simple);

    if (audio.length) {
      return audio;
    }

    return [
      speech,
      guide ? {
      kind: "guide",
      label: "Guide speech",
      text: guide
      } : null
    ].filter(Boolean);
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

  function variantsTextFromResult(result = {}) {
    return normalizeAliases(result.variants).join("; ");
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

  function sourceSpeechItem(result = {}) {
    const sourceForm = normalizeText(result.sourceForm || result.display || result.query);
    const lang = normalizeText(result.ttsLang || result.language);
    const selected = normalizeText(result.query || result.display);

    if (!sourceForm || !lang || baseLanguage(lang) === "en") {
      return null;
    }

    return {
      kind: "speech",
      label: selected && sourceForm !== selected ? "Source-form speech" : "Resolved speech",
      text: sourceForm,
      lang
    };
  }

  function baseLanguage(value) {
    return String(value || "").trim().toLowerCase().split(/[-_]/)[0];
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

  globalThis.__sayThisOverlayResultView = {
    aliasesTextFromResult,
    alternateItems,
    audioItems,
    correctionInput,
    escapeAttribute,
    escapeHtml,
    firstSourceUrl,
    getBestAudio,
    normalizeAliases,
    normalizeLanguageHints,
    normalizeLongText,
    normalizeText,
    playbackItems,
    sourceItems,
    trustSignalItems,
    variantItems,
    variantsTextFromResult
  };
})();
