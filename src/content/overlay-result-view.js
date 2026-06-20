(function installSayThisOverlayResultView() {
  if (globalThis.__sayThisOverlayResultView) {
    return;
  }

  const GUIDE_PROSE_MARKERS = /\b(?:context|contexts|depending|often|pronunciation|pronunciations|pronounced|speaker|speakers|source form|usually|varies|vary|voice)\b/i;
  const languageHelpers = globalThis.__sayThisOverlayLanguage || {};
  const normalizeTtsLanguage = languageHelpers.normalizeTtsLanguage ||
    ((ttsLang, language = "") => normalizeText(ttsLang || language));

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

  function hasTopTierAudio(result) {
    const bestAudio = getBestAudio(result);
    return Boolean(bestAudio && qualityScore(bestAudio.quality) >= 105);
  }

  function isSharedAudioCandidate(result = {}, selectedText = "") {
    const sourceForm = normalizeText(result?.sourceForm || result?.display || result?.query);
    const ttsLang = normalizeTtsLanguage(result?.ttsLang, result?.language);
    const sourceStatus = normalizeText(result?.sourceStatus);
    return Boolean(
      result &&
      !hasTopTierAudio(result) &&
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
    const selectedAlias = selectedAliasSpeechItem(result);
    const speech = sourceSpeechItem(result);
    const guide = normalizeSpeakableGuide(result?.pronunciation?.simple);
    const fallback = speechFallbackItems(selectedAlias, speech, guide);

    if (!audio.length) {
      return fallback;
    }

    if (audio.some((item) => isPreferredAudioItem(item, result?.sourceStatus))) {
      return selectedAlias ? [selectedAlias, ...audio] : audio;
    }

    if (selectedAlias) {
      return [
        selectedAlias,
        ...audio,
        ...fallback.filter((item) => item !== selectedAlias)
      ];
    }

    return fallback.length ? [...audio, ...fallback] : audio;
  }

  function speechFallbackItems(selectedAlias, speech, guide) {
    return [
      selectedAlias,
      speech,
      guide
        ? {
          kind: "guide",
          label: "Guide speech",
          text: guide
        }
        : null
    ].filter(Boolean);
  }

  function preferredSpeechResult(result) {
    const items = playbackItems(result);
    const item = items.find((candidate) => candidate.kind === "speech")
      || items.find((candidate) => candidate.kind === "guide");
    return speechResultForPlaybackItem(result, item);
  }

  function shouldPreferSpeechBeforeAudio(result = {}) {
    return Boolean(selectedAliasSpeechItem(result));
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
        ttsLang: normalizeTtsLanguage(item.lang || result.ttsLang, result.language)
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

    if (["source-backed", "recorded"].includes(quality)) {
      return 105;
    }

    if (quality === "verified") {
      return 100;
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
    const lang = normalizeTtsLanguage(result.ttsLang, result.language);
    const selected = normalizeText(result.query || result.display);
    const sourceKey = createLookupKey(sourceForm);
    const selectedKey = createLookupKey(selected);
    const sourceDiffers = Boolean(sourceKey && selectedKey && sourceKey !== selectedKey);

    if (isBestEffortProperNameSpeech(result, sourceForm, selected)) {
      return {
        kind: "speech",
        label: "Best-effort speech",
        text: sourceForm,
        lang: "en-US"
      };
    }

    if (
      !sourceForm ||
      !lang ||
      (baseLanguage(lang) === "en" && !sourceDiffers) ||
      shouldHideCrossLanguageEnglishSpeech(result.language, lang)
    ) {
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

  function shouldHideCrossLanguageEnglishSpeech(language, lang) {
    const languageBase = baseLanguage(language);
    return Boolean(languageBase && !["unknown", "und", "en", "eng"].includes(languageBase) && baseLanguage(lang) === "en");
  }

  const NAME_CONNECTOR_WORDS = new Set(["a", "al", "and", "ap", "bin", "da", "de", "del", "der", "di", "du", "el", "ibn", "in", "la", "le", "of", "saint", "san", "santa", "st", "the", "van", "von"]);

  function isBestEffortProperNameSpeech(result = {}, sourceForm = "", selected = "") {
    if (normalizeText(result.sourceStatus) !== "best-effort-fallback") {
      return false;
    }

    if (!sourceForm || sourceForm.length > 90 || /[.!?;:]/.test(sourceForm)) {
      return false;
    }

    if (selected && createLookupKey(sourceForm) !== createLookupKey(selected)) {
      return false;
    }

    const words = sourceForm.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 8) {
      return false;
    }

    return words.every(isNameLikeWord);
  }

  function isNameLikeWord(word = "") {
    const normalized = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!normalized) {
      return false;
    }

    if (NAME_CONNECTOR_WORDS.has(normalized.toLocaleLowerCase())) {
      return true;
    }

    return /^[\p{Lu}\p{Lt}][\p{L}\p{M}'’.-]*$/u.test(normalized);
  }

  function selectedAliasSpeechItem(result = {}) {
    const selected = normalizeText(result.query || result.display);
    const sourceForm = normalizeText(result.sourceForm || result.display);
    const selectedKey = createLookupKey(selected);
    if (!selected || !selectedKey || sourceFormMatchesSelected(sourceForm, selected)) {
      return null;
    }

    const surfaceKeys = [
      ...normalizeAliases(result.aliases),
      ...normalizeAliases(result.variants)
    ].map(createLookupKey);
    if (!surfaceKeys.includes(selectedKey)) {
      return null;
    }

    const lang = selectedAliasLanguage(result);
    if (!lang) {
      return null;
    }

    return {
      kind: "speech",
      label: "Selected text speech",
      text: selected,
      lang
    };
  }

  function selectedAliasLanguage(result = {}) {
    const lang = normalizeTtsLanguage(result.selectedTtsLang || result.aliasTtsLang || result.ttsLang, result.language);
    if (!lang || shouldHideCrossLanguageEnglishSpeech(result.language, lang)) {
      return "en-US";
    }

    return lang;
  }

  function sourceFormMatchesSelected(sourceForm, selected) {
    const sourceKey = createLookupKey(sourceForm);
    const selectedKey = createLookupKey(selected);
    if (!sourceKey || !selectedKey || sourceKey === selectedKey) {
      return true;
    }

    if (detectScript(selected) === "Latin" && detectScript(sourceForm) === "Cyrillic") {
      const romanizedKey = createLookupKey(transliterateCyrillicToLatin(sourceForm));
      return Boolean(romanizedKey && compactKey(romanizedKey) === compactKey(selectedKey));
    }

    return false;
  }

  function detectScript(value) {
    const text = normalizeText(value);
    const latin = (text.match(/[\u0041-\u007a\u00c0-\u024f\u1e00-\u1eff]/g) || []).length;
    const cyrillic = (text.match(/[\u0400-\u052f]/g) || []).length;
    if (!latin && !cyrillic) {
      return "Unknown";
    }

    return cyrillic > latin ? "Cyrillic" : "Latin";
  }

  function transliterateCyrillicToLatin(value = "") {
    const map = {
      а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ye", ё: "yo", ж: "zh", з: "z",
      и: "y", і: "i", ї: "yi", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
      с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "",
      ъ: "", ы: "y", э: "e", ю: "yu", я: "ya"
    };
    return String(value || "").replace(/[\u0400-\u052f]/g, (character) => {
      const lower = character.toLocaleLowerCase();
      const replacement = map[lower] ?? character;
      return character === lower ? replacement : capitalize(replacement);
    });
  }

  function capitalize(value) {
    return value ? value[0].toLocaleUpperCase() + value.slice(1) : value;
  }

  function compactKey(value) {
    return String(value || "").replace(/\s+/g, "");
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
    hasTopTierAudio,
    isSharedAudioCandidate,
    normalizeAliases,
    normalizeLanguageHints,
    normalizeLongText,
    normalizeSpeakableGuide,
    normalizeText,
    playbackItems,
    playbackStatus,
    preferredSpeechResult,
    shouldPreferSpeechBeforeAudio,
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
