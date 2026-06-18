(function installSayThisOverlayResultView() {
  if (globalThis.__sayThisOverlayResultView) {
    return;
  }

  const GUIDE_PROSE_MARKERS = /\b(?:context|contexts|depending|often|pronunciation|pronunciations|pronounced|speaker|speakers|source form|usually|varies|vary|voice)\b/i;

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

    return rankedAudioItems(audio)[0] || null;
  }

  function hasPreferredAudio(result) {
    const audio = result?.pronunciation?.audio;
    if (!Array.isArray(audio) || !audio.length) {
      return false;
    }

    return rankedAudioItems(audio).some((item) => isPreferredAudioItem(item, result?.sourceStatus));
  }

  function isSharedAudioCandidate(result = {}, selectedText = "") {
    const sourceForm = normalizeText(result?.sourceForm || result?.display || result?.query);
    const ttsLang = normalizeText(result?.ttsLang || result?.language);
    const sourceStatus = normalizeText(result?.sourceStatus);
    return Boolean(
      result &&
      !hasPreferredAudio(result) &&
      sourceForm &&
      ttsLang &&
      !["", "unknown", "best-effort-fallback"].includes(sourceStatus) &&
      hasUsefulSharedAudioTarget(selectedText || result?.query || result?.display, sourceForm, result?.language, ttsLang)
    );
  }

  function sourceItems(result) {
    const sources = Array.isArray(result?.sources) ? result.sources : [];
    const audio = audioItems(result);
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

    for (const item of rankedAudioItems(audio)) {
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
    const guide = normalizeSpeakableGuide(result?.pronunciation?.simple);

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

  function preferredSpeechResult(result) {
    const items = playbackItems(result);
    const item = items.find((candidate) => candidate.kind === "speech")
      || items.find((candidate) => candidate.kind === "guide");
    return speechResultForPlaybackItem(result, item);
  }

  function speechResultForPlaybackItem(result, item = {}) {
    const text = normalizeText(item.text);
    if (!result || item?.kind === "audio" || !text) {
      return result;
    }

    if (item.kind === "guide") {
      return {
        ...result,
        speakText: text,
        ttsLang: "en-US",
        pronunciation: {
          ...(result.pronunciation || {}),
          simple: text
        }
      };
    }

    if (item.kind === "speech") {
      return {
        ...result,
        sourceForm: text,
        speakText: text,
        ttsLang: normalizeText(item.lang || result.ttsLang || result.language)
      };
    }

    return result;
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

  function normalizeSpeakableGuide(value) {
    const guide = normalizeText(value);
    if (!guide || guide.length > 120 || /[.;]/.test(guide) || GUIDE_PROSE_MARKERS.test(guide)) {
      return "";
    }

    if (guide.split(/\s+/).length > 12) {
      return "";
    }

    return guide;
  }

  function createLookupKey(value) {
    return normalizeText(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
      .replace(/[\s\-_]+/g, " ")
      .toLocaleLowerCase();
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
    const source = normalizeText(item?.source);
    const quality = normalizeText(item?.quality);
    return {
      label: audioItemLabel(item?.label, source, quality, url),
      source,
      quality,
      url
    };
  }

  function audioItemLabel(label, source, quality, url) {
    const fallback = normalizeText(label || source || hostLabel(url) || "Pronunciation audio");
    if (normalizeText(quality).toLowerCase() !== "generated") {
      return fallback;
    }

    return /\bgenerated\b|\bshared audio\b/i.test(fallback)
      ? fallback
      : `Generated fallback: ${fallback}`;
  }

  function rankedAudioItems(audio) {
    return (Array.isArray(audio) ? audio : [])
      .filter((item) => item?.url)
      .map((item, index) => ({ item, index }))
      .sort((left, right) =>
        audioScore(right.item) - audioScore(left.item) ||
        left.index - right.index)
      .map(({ item }) => item);
  }

  function isPreferredAudioItem(item = {}, sourceStatus = "") {
    const quality = normalizeText(item.quality).toLowerCase();
    if (!item.url || quality === "generated") {
      return false;
    }

    return qualityScore(quality) >= 85 ||
      ["verified-audio", "community-confirmed"].includes(normalizeText(sourceStatus));
  }

  function audioScore(item) {
    return qualityScore(item?.quality) + sourceScore(item?.source || item?.label);
  }

  function qualityScore(value) {
    const quality = normalizeText(value).toLowerCase();
    if (["curated", "native", "native speaker", "native-speaker"].includes(quality)) {
      return 115;
    }

    if (quality === "verified") {
      return 100;
    }

    if (["source-backed", "recorded"].includes(quality)) {
      return 85;
    }

    if (quality === "generated") {
      return 0;
    }

    return 40;
  }

  function sourceScore(value) {
    const source = normalizeText(value).toLowerCase();
    if (
      source.includes("saythis") ||
      source.includes("curated") ||
      source.includes("packaged") ||
      source.includes("public audio")
    ) {
      return 12;
    }
    if (source.includes("native speaker")) {
      return 10;
    }
    if (source.includes("forvo")) {
      return 8;
    }
    if (source.includes("wiktionary")) {
      return 7;
    }
    if (source.includes("wikidata")) {
      return 6;
    }
    if (source.includes("commons")) {
      return 5;
    }
    if (source.includes("community")) {
      return 4;
    }
    return 1;
  }

  function sourceSpeechItem(result = {}) {
    const sourceForm = normalizeText(result.sourceForm || result.display || result.query);
    const lang = normalizeText(result.ttsLang || result.language);
    const selected = normalizeText(result.query || result.display);
    const sourceKey = createLookupKey(sourceForm);
    const selectedKey = createLookupKey(selected);
    const sourceDiffers = Boolean(sourceKey && selectedKey && sourceKey !== selectedKey);

    if (!sourceForm || !lang || (baseLanguage(lang) === "en" && !sourceDiffers)) {
      return null;
    }

    return {
      kind: "speech",
      label: sourceDiffers ? "Source-form speech" : "Resolved speech",
      text: sourceForm,
      lang
    };
  }

  function baseLanguage(value) {
    return String(value || "").trim().toLowerCase().split(/[-_]/)[0];
  }

  function hasUsefulSharedAudioTarget(selectedText, sourceForm, language, ttsLang) {
    const sourceFormChanged = createLookupKey(selectedText) !== createLookupKey(sourceForm);
    const nonEnglishLanguage = hasNonEnglishLanguageSignal(language);
    const nonEnglishTts = hasNonEnglishLanguageSignal(ttsLang);
    if (nonEnglishLanguage && !nonEnglishTts) {
      return false;
    }

    return sourceFormChanged || nonEnglishTts;
  }

  function hasNonEnglishLanguageSignal(value) {
    const normalized = normalizeText(value).toLowerCase();
    const base = baseLanguage(normalized);
    if (!base || ["unknown", "und", "en", "eng"].includes(base) || normalized.startsWith("english")) {
      return false;
    }

    return true;
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
    hasPreferredAudio,
    isSharedAudioCandidate,
    normalizeAliases,
    normalizeLanguageHints,
    normalizeLongText,
    normalizeSpeakableGuide,
    normalizeText,
    playbackItems,
    playbackStatus,
    preferredSpeechResult,
    speechResultForPlaybackItem,
    sourceItems,
    trustSignalItems,
    variantItems,
    variantsTextFromResult
  };

  function playbackStatus(item = {}, rate = 0.82) {
    if (item.kind === "audio" && normalizeText(item.quality).toLowerCase() === "generated") {
      return rate < 0.7 ? "Playing generated audio slowly." : "Playing generated audio.";
    }

    if (item.kind === "audio") {
      return rate < 0.7 ? "Playing recording slowly." : "Playing recording.";
    }

    if (item.kind === "guide") {
      return rate < 0.7 ? "Speaking guide slowly." : "Speaking guide.";
    }

    return rate < 0.7 ? "Speaking slowly." : "Speaking.";
  }
})();
