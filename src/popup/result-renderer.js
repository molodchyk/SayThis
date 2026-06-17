import {
  alternateItemsForResult,
  audioItemsForResult,
  evidenceItemsForResult,
  sourceItemsForResult
} from "../result-view.js";
import {
  correctionValuesFromResult
} from "../correction-form.js";

export function renderPopupResult(result, elements, actions = {}) {
  if (!result) {
    elements.resultCard.hidden = true;
    return;
  }

  const doc = actions.document || globalThis.document;
  const speakAlternate = actions.speakAlternate || (() => {});
  const playAudioItem = actions.playAudioItem || (() => false);
  const setStatus = actions.setStatus || (() => {});

  elements.resultCard.hidden = false;
  elements.resultDisplay.textContent = result.display || result.query || "Unknown";
  elements.confidenceBadge.textContent = result.confidence || "unknown";
  elements.sourceBadge.textContent = result.sourceLabel || result.sourceStatus || "Unknown";

  const correctionValues = correctionValuesFromResult(result);
  elements.sourceForm.textContent = result.sourceForm || "No source form";
  elements.aliasesDisplay.textContent = correctionValues.aliases || "None";
  elements.language.textContent = result.languageName || result.language || "Unknown";
  elements.category.textContent = result.category || "Unknown";
  elements.origin.textContent = result.origin || "Unknown";
  elements.root.textContent = result.root || "Unknown";
  elements.domainHint.textContent = result.domainHint || "Unknown";
  elements.variants.textContent = correctionValues.variants || "None";
  elements.ipa.textContent = result.pronunciation?.ipa || "Not available";
  elements.simpleGuide.textContent = result.pronunciation?.simple || "Not available";

  elements.correctionSource.value = correctionValues.sourceForm;
  elements.correctionAliases.value = correctionValues.aliases;
  elements.correctionLanguage.value = correctionValues.language;
  elements.correctionLanguageName.value = correctionValues.languageName;
  elements.correctionSimple.value = correctionValues.simple;
  elements.correctionIpa.value = correctionValues.ipa;
  elements.correctionOrigin.value = correctionValues.origin;
  elements.correctionRoot.value = correctionValues.root;
  elements.correctionDomain.value = correctionValues.domainHint;
  elements.correctionVariants.value = correctionValues.variants;
  elements.correctionAudio.value = correctionValues.audioUrl;
  elements.correctionSourceUrl.value = correctionValues.sourceUrl;
  elements.correctionVariant.value = correctionValues.variantNote;

  elements.alternates.replaceChildren();
  for (const item of alternateItemsForResult(result)) {
    const li = doc.createElement("li");
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "small secondary";
    button.textContent = "Speak";
    button.addEventListener("click", () => speakAlternate(item.index, 0.82));
    const label = doc.createElement("span");
    label.className = "alternate-label";
    label.textContent = item.display || "Alternate";
    const summary = doc.createElement("span");
    summary.textContent = item.summary;
    li.append(button, label, summary);
    elements.alternates.append(li);
  }

  elements.audioList.replaceChildren();
  for (const item of audioItemsForResult(result)) {
    const li = doc.createElement("li");
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "small secondary";
    button.textContent = "Play";
    button.addEventListener("click", () => {
      if (playAudioItem(item, result, 0.82)) {
        setStatus("Playing recording.");
      }
    });
    const label = doc.createElement("span");
    label.textContent = item.label || "Pronunciation audio";
    li.append(button, label);
    elements.audioList.append(li);
  }

  elements.evidence.replaceChildren();
  for (const item of evidenceItemsForResult(result)) {
    const li = doc.createElement("li");
    li.textContent = item;
    elements.evidence.append(li);
  }

  elements.sources.replaceChildren();
  for (const item of sourceItemsForResult(result)) {
    const li = doc.createElement("li");
    const anchor = doc.createElement("a");
    anchor.href = item.url;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = item.label;
    li.append(anchor);
    elements.sources.append(li);
  }
}
