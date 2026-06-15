import {
  createRemoteStructuredResult,
  mergeRemoteResult,
  normalizeSelection,
  resultToSpeechOptions,
  resolveTerm,
  updateCommunityEntries
} from "./resolver-core.js";

const MENU_ID = "saythis-pronounce-selection";
const STORAGE_KEYS = {
  communityEntries: "communityEntries",
  lastResult: "lastResult",
  lastSelection: "lastSelection",
  lastSource: "lastSource",
  settings: "settings"
};
const DEFAULT_SETTINGS = {
  onlineByDefault: false,
  showOverlay: true
};

let seedPromise;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "SayThis: pronounce \"%s\"",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) {
    return;
  }

  const selectedText = normalizeSelection(info.selectionText);
  if (!selectedText) {
    return;
  }

  chrome.storage.local.set({
    lastSelection: selectedText,
    lastSource: "context-menu"
  });

  resolveSelection(selectedText)
    .then(async (result) => {
      await chrome.storage.local.set({
        [STORAGE_KEYS.lastResult]: result
      });
      speakResult(result);
      showResultOnTab(tab?.id, result);
    })
    .catch(() => speakFallback(selectedText));
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "pronounce-selection") {
    return;
  }

  pronounceActiveSelection();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SAYTHIS_RESOLVE") {
    resolveSelection(message.text, { useOnline: Boolean(message.useOnline) })
      .then((result) => {
        sendResponse({ ok: true, result });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || "Resolve failed." });
      });
    return true;
  }

  if (message?.type === "SAYTHIS_SPEAK") {
    const selectedText = normalizeSelection(message.text);
    if (!selectedText) {
      sendResponse({ ok: false, error: "No text selected." });
      return true;
    }

    const resultPromise = message.result
      ? Promise.resolve(message.result)
      : resolveSelection(selectedText, { useOnline: Boolean(message.useOnline) });

    resultPromise
      .then((result) => {
        speakResult(result, { rate: message.rate, lang: message.lang });
        sendResponse({ ok: true, result });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || "Speech failed." });
      });
    return true;
  }

  if (message?.type === "SAYTHIS_STOP") {
    chrome.tts.stop();
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "SAYTHIS_FEEDBACK") {
    saveFeedback(message.text, message.feedback || {})
      .then((result) => {
        sendResponse({ ok: true, result });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || "Feedback failed." });
      });
    return true;
  }

  return false;
});

async function resolveSelection(text, options = {}) {
  const selectedText = normalizeSelection(text);
  const data = await loadSeedData();
  const stored = await chrome.storage.local.get([STORAGE_KEYS.communityEntries, STORAGE_KEYS.settings]);
  const communityEntries = stored[STORAGE_KEYS.communityEntries] || {};
  const settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  const localResult = resolveTerm(selectedText, {
    entries: data.entries,
    communityEntries
  });

  let result = localResult;
  const shouldUseOnline = options.useOnline ?? settings.onlineByDefault;
  if (shouldUseOnline) {
    try {
      const remoteResult = await resolveWithWikidata(selectedText);
      result = mergeRemoteResult(localResult, remoteResult);
    } catch {
      result = {
        ...localResult,
        evidence: [...(localResult.evidence || []), "Online lookup unavailable"]
      };
    }
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.lastSelection]: selectedText,
    [STORAGE_KEYS.lastResult]: result
  });

  return result;
}

async function saveFeedback(text, feedback) {
  const selectedText = normalizeSelection(text);
  const stored = await chrome.storage.local.get([STORAGE_KEYS.communityEntries]);
  const communityEntries = updateCommunityEntries(stored[STORAGE_KEYS.communityEntries], selectedText, feedback);
  await chrome.storage.local.set({
    [STORAGE_KEYS.communityEntries]: communityEntries
  });

  return resolveSelection(selectedText, { useOnline: false });
}

async function loadSeedData() {
  if (!seedPromise) {
    seedPromise = fetch(chrome.runtime.getURL("data/pronunciation-seed.json")).then((response) => response.json());
  }

  return seedPromise;
}

function speakResult(result, overrides = {}) {
  const speech = resultToSpeechOptions(result, overrides);
  if (!speech.text) {
    return;
  }

  chrome.tts.stop();
  chrome.tts.speak(speech.text, speech.options);
}

function speakFallback(text) {
  chrome.tts.stop();
  chrome.tts.speak(text, {
    enqueue: false,
    rate: 0.82
  });
}

async function pronounceActiveSelection() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }

  const selectedText = await readSelectionFromTab(tab.id);
  if (!selectedText) {
    return;
  }

  const result = await resolveSelection(selectedText);
  speakResult(result);
  showResultOnTab(tab.id, result);
}

async function readSelectionFromTab(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection()?.toString() || ""
    });

    return normalizeSelection(result?.result);
  } catch {
    return "";
  }
}

async function showResultOnTab(tabId, result) {
  if (!tabId || !result) {
    return;
  }

  try {
    const settings = await getSettings();
    if (!settings.showOverlay) {
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content-overlay.js"]
    });
    await chrome.tabs.sendMessage(tabId, {
      type: "SAYTHIS_SHOW_RESULT",
      result
    });
  } catch {
    // Some pages do not allow extension script injection.
  }
}

async function resolveWithWikidata(text) {
  const query = normalizeSelection(text);
  if (!query) {
    return null;
  }

  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: query,
    language: "en",
    uselang: "en",
    format: "json",
    origin: "*",
    limit: "1"
  });

  const searchResponse = await fetch(`https://www.wikidata.org/w/api.php?${params.toString()}`);
  if (!searchResponse.ok) {
    return null;
  }

  const searchData = await searchResponse.json();
  const match = searchData.search?.[0];
  if (!match?.id) {
    return null;
  }

  const entityResponse = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(match.id)}.json`);
  if (!entityResponse.ok) {
    return createRemoteStructuredResult(query, {
      id: `wikidata:${match.id}`,
      display: match.label || query,
      sourceForm: match.label || query,
      language: "en",
      languageName: "English",
      category: match.description || "structured source match",
      confidence: "low",
      evidence: [`Wikidata search match ${match.id}`],
      sources: [{ label: "Wikidata", url: match.concepturi || `https://www.wikidata.org/wiki/${match.id}` }]
    });
  }

  const entityData = await entityResponse.json();
  const entity = entityData.entities?.[match.id];
  if (!entity) {
    return null;
  }

  const source = extractWikidataSource(query, match, entity);
  return createRemoteStructuredResult(query, source);
}

function extractWikidataSource(query, match, entity) {
  const labels = Object.values(entity.labels || {}).map((label) => ({
    language: label.language,
    value: label.value
  }));
  const selectedScript = detectScriptName(query);
  const sourceLabel = chooseSourceLabel(labels, selectedScript) || {
    language: match.language || "en",
    value: match.label || query
  };
  const description = entity.descriptions?.en?.value || match.description || "";
  const aliases = Object.values(entity.aliases || {})
    .flat()
    .map((alias) => alias.value)
    .slice(0, 8);

  return {
    id: `wikidata:${entity.id}`,
    display: match.label || query,
    sourceForm: sourceLabel.value,
    language: sourceLabel.language,
    languageName: "",
    category: description || "structured source match",
    origin: description,
    confidence: sourceLabel.value === query ? "low" : "medium",
    evidence: [
      `Wikidata entity ${entity.id}`,
      aliases.length ? `Aliases: ${aliases.join(", ")}` : ""
    ].filter(Boolean),
    sources: [{ label: "Wikidata", url: `https://www.wikidata.org/wiki/${entity.id}` }]
  };
}

function chooseSourceLabel(labels, selectedScript) {
  const nonMatchingScript = labels.find((label) => label.value && detectScriptName(label.value) !== selectedScript);
  if (nonMatchingScript) {
    return nonMatchingScript;
  }

  return labels.find((label) => label.language !== "en") || labels.find((label) => label.language === "en") || null;
}

function detectScriptName(value) {
  return resolveTerm(value, { entries: [] }).script;
}

async function getSettings() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.settings]);
  return normalizeSettings(stored[STORAGE_KEYS.settings]);
}

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    onlineByDefault: Boolean(settings.onlineByDefault),
    showOverlay: settings.showOverlay !== false
  };
}
