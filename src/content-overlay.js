(function installSayThisOverlay() {
  if (window.__sayThisOverlayReady) {
    return;
  }
  window.__sayThisOverlayReady = true;

  let host;
  let root;
  let audioPlayer;
  let currentResult = null;
  const overlayStyles = globalThis.__sayThisOverlayStyles || "";
  const overlayRuntime = globalThis.__sayThisOverlayRuntimeAdapters || {};
  const overlayResultView = globalThis.__sayThisOverlayResultView || {};
  const runtimeAdapters = overlayRuntime.createOverlayRuntimeAdapters?.() || {};
  const sharedAudioUiWaitMs = normalizeUiWaitMs(globalThis.__sayThisSharedAudioUiWaitMs, 900);
  const {
    aliasesTextFromResult,
    alternateItems,
    correctionInput,
    escapeAttribute,
    escapeHtml,
    fallbackSpeechResult = (result) => preferredSpeechResult(result),
    firstSourceUrl,
    getBestAudio,
    hasPreferredAudio = (result) => Boolean(getBestAudio(result)),
    hasTopTierAudio = (result) => {
      const quality = String(getBestAudio(result)?.quality || "").trim().toLowerCase();
      return ["curated", "native", "native speaker", "native-speaker", "source-backed", "recorded"].includes(quality);
    },
    isSharedAudioCandidate: sharedAudioCandidateForResult = () => false,
    normalizeAliases,
    normalizeLanguageHints,
    normalizeLongText,
    normalizeText,
    playbackMeta = () => "",
    playbackItems,
    playbackStatus = (item) => item?.kind === "audio" ? "Playing recording." : "Speaking.",
    speechResultForPlaybackItem = (result) => result,
    preferredSpeechResult = (result) => speechResultForPlaybackItem(result),
    shouldPreferSpeechBeforeAudio = () => false,
    sourceItems,
    trustSignalItems,
    variantItems,
    variantsTextFromResult
  } = overlayResultView;
  let playbackUiToken = 0;
  let playbackMayBeActive = false;

  overlayRuntime.addShowResultListener?.((result, options) => {
    renderOverlay(result, options);
  }, runtimeAdapters);
  overlayRuntime.addVisibleResultListener?.(() => currentResult, runtimeAdapters);

  function renderOverlay(result, options = {}) {
    if (!result) {
      return;
    }

    currentResult = result;
    ensureRoot();
    const evidence = [
      ...trustSignalItems(result.trustSignals),
      ...(result.evidence || []),
      result.root ? `Root: ${result.root}` : "",
      result.domainHint ? `Domain: ${result.domainHint}` : "",
      ...variantItems(result.variants),
      result.notes || result.variantNote || ""
    ].filter(Boolean).slice(0, 2);
    const sources = sourceItems(result).slice(0, 2);
    const alternates = alternateItems(result).slice(0, 2);
    const recordings = playbackItems(result).slice(0, 4);
    const resultTitle = shouldPreferSpeechBeforeAudio(result)
      ? normalizeText(result.query || result.display || result.sourceForm || "Unknown")
      : normalizeText(result.display || result.query || result.sourceForm || "Unknown");
    const correctionAudioUrl = hasPreferredAudio(result) ? getBestAudio(result)?.url : "";
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
          <div class="title-block">
            <span class="eyebrow">SayThis</span>
            <div class="title-row">
              <h2>${escapeHtml(resultTitle || "Unknown")}</h2>
              <button class="listen-main" type="button" data-action="speak" data-playback-control="true">Listen</button>
            </div>
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
            <dt>Domain</dt>
            <dd>${escapeHtml(result.domainHint || "Unknown")}</dd>
          </div>
          <div>
            <dt>Variants</dt>
            <dd>${escapeHtml(variantsTextFromResult(result) || "None")}</dd>
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
        ${alternates.length ? `<ul class="alternates">${alternates.map((item) => `<li><button type="button" data-action="alternate" data-alternate-index="${item.index}" data-playback-control="true">Speak</button><strong>${escapeHtml(item.display || "Alternate")}</strong><span>${escapeHtml(item.summary)}</span></li>`).join("")}</ul>` : ""}
        ${recordings.length ? `<ul class="recordings" aria-label="Pronunciation playback">${recordings.map((item, index) => {
          const meta = playbackMeta(item);
          return `<li><button type="button" data-action="recording" data-audio-index="${index}" data-playback-control="true">${item.kind === "audio" ? "Play" : "Speak"}</button><span class="playback-label">${escapeHtml(item.label || "Pronunciation audio")}</span>${meta ? `<span class="playback-meta">${escapeHtml(meta)}</span>` : ""}</li>`;
        }).join("")}</ul>` : ""}
        ${sources.length ? `<ul class="sources">${sources.map((item) => `<li><a href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)}</a></li>`).join("")}</ul>` : ""}
        <label class="hint-field">
          <span>Lookup hints</span>
          <input data-lookup-hints type="text" maxlength="80" value="${escapeAttribute(options.lookupHints || "")}" placeholder="pl, tr, ja" spellcheck="false">
        </label>
        <div class="actions">
          <button class="action secondary" type="button" data-action="online">Online</button>
          <button class="action secondary" type="button" data-action="slow" data-playback-control="true">Slow</button>
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
            ${correctionInput("Domain hint", "domainHint", result.domainHint, 160, "full")}
            ${correctionInput("Variants", "variants", variantsTextFromResult(result), 240, "full")}
            ${correctionInput("Audio source", "audioUrl", correctionAudioUrl, 2048, "full", "url")}
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
      stopPlayback(true);
      host.remove();
      host = null;
      root = null;
      currentResult = null;
    });

    root.querySelector('[data-action="speak"]').addEventListener("click", (event) => speak(result, 0.82, {
      onlineChecked: Boolean(options.onlineChecked),
      button: event.currentTarget
    }));
    root.querySelector('[data-action="online"]').addEventListener("click", () => resolveOnline(result));
    root.querySelector('[data-action="slow"]').addEventListener("click", (event) => speak(result, 0.62, {
      onlineChecked: Boolean(options.onlineChecked),
      button: event.currentTarget
    }));
    root.querySelector('[data-action="correct"]').addEventListener("click", () => toggleCorrection());
    root.querySelector('[data-action="confirm"]').addEventListener("click", () => sendFeedback(result, "confirm"));
    root.querySelector('[data-action="missing"]').addEventListener("click", () => sendFeedback(result, "missing", correctionFeedbackFromForm("missing")));
    root.querySelector('[data-action="wrong"]').addEventListener("click", () => sendFeedback(result, "wrong"));
    for (const button of root.querySelectorAll('[data-action="alternate"]')) {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.alternateIndex);
        const alternate = result.alternateResults?.[index];
        const alternateAudio = typeof getBestAudio === "function" ? getBestAudio(alternate) : null;
        if (playAudioItem(alternateAudio, alternate, 0.82, {
          button,
          replaceCurrent: false,
          status: "Playing alternate."
        })) {
          return;
        }

        speakCandidate(preferredSpeechResult(alternate), 0.82, {
          button,
          replaceCurrent: false
        });
      });
    }
    for (const button of root.querySelectorAll('[data-action="recording"]')) {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.audioIndex);
        const item = recordings[index];
        if (item?.kind !== "audio") {
          speakCandidate(speechResultForPlaybackItem(result, item), 0.82, { button });
        } else {
          playAudioItem(item, result, 0.82, {
            button,
            skipSharedAudio: true,
            status: playbackStatus(item, 0.82)
          });
        }
      });
    }
    root.querySelector('[data-action="cancel-correction"]').addEventListener("click", () => toggleCorrection(false));
    root.querySelector("[data-correction]").addEventListener("submit", (event) => {
      event.preventDefault();
      sendCorrection(result);
    });

    if (options.autoPlay) {
      speak(result, options.autoPlayRate || 0.82, {
        onlineChecked: Boolean(options.onlineChecked),
        trace: options.trace
      });
    }
  }

  function resolveOnline(result, options = {}) {
    const languageHints = lookupHints();
    setStatus("Checking online sources.");
    sendOverlayMessage({
      type: "SAYTHIS_RESOLVE",
      text: result.query || result.display,
      useOnline: true,
      languageHints
    }).then((response) => {
      if (!response?.ok) {
        setStatus(response?.error || "Online lookup failed.");
        if (options.autoPlay !== false) {
          speakCandidate(result, options.rate || 0.82, {
            trace: options.trace
          });
        }
        return;
      }

      renderOverlay(response.result || result, {
        autoPlay: options.autoPlay !== false,
        autoPlayRate: options.rate || 0.82,
        lookupHints: languageHints.join(", "),
        onlineChecked: true,
        trace: options.trace
      });
      setStatus("Online result ready.");
    });
  }

  function sendFeedback(result, kind, feedback = { kind }) {
    setStatus("Saving.");

    sendOverlayMessage({
      type: "SAYTHIS_FEEDBACK",
      text: result.query || result.display,
      feedback
    }).then((response) => {
      if (!response?.ok) {
        setStatus(response?.error || "Could not save.");
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
    sendOverlayMessage({
      type: "SAYTHIS_FEEDBACK",
      text: result.query || result.display,
      feedback
    }).then((response) => {
      if (!response?.ok) {
        setStatus(response?.error || "Could not save.");
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
      } else if (field === "variants") {
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
    return ["sourceForm", "language", "languageName", "origin", "root", "domainHint", "ipa", "simple", "audioUrl", "sourceUrl", "variantNote"]
      .some((field) => Boolean(feedback[field])) ||
      Boolean(normalizeAliases(feedback.aliases).length) ||
      Boolean(normalizeAliases(feedback.variants).length);
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

  function ensurePlaybackOptions(options = {}, rate = 0.82) {
    if (options.uiToken) {
      return options;
    }

    const status = rate < 0.7 ? "Loading slow audio." : "Loading audio.";
    return {
      ...options,
      stopPrevious: playbackMayBeActive,
      uiToken: beginPlayback(options.button, status)
    };
  }

  function beginPlayback(button, status) {
    const token = playbackUiToken + 1;
    playbackUiToken = token;
    resetPlaybackButtons();
    setPlaybackControlsDisabled(true, button);
    setPlaybackButton(button, "Loading...", "is-busy");
    setStatus(status);
    return token;
  }

  function markPlaybackStarted(token, button, label, status) {
    if (token !== playbackUiToken) {
      return;
    }

    setPlaybackControlsDisabled(false);
    setPlaybackButton(button, label, "is-playing");
    setStatus(status);
    playbackMayBeActive = true;
  }

  function failPlayback(token, status) {
    if (token !== playbackUiToken) {
      return;
    }

    resetPlaybackButtons();
    setStatus(status);
    playbackMayBeActive = false;
  }

  function resetPlaybackButtons() {
    for (const button of playbackButtons()) {
      restorePlaybackButton(button);
      button.disabled = false;
    }
  }

  function setPlaybackControlsDisabled(disabled, activeButton = null) {
    for (const button of playbackButtons()) {
      button.disabled = Boolean(disabled && button !== activeButton);
    }
  }

  function setPlaybackButton(button, label, className) {
    if (!button) {
      return;
    }

    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = button.textContent || "";
    }
    button.textContent = label;
    button.disabled = className === "is-busy";
    button.classList?.remove?.("is-busy", "is-playing");
    button.classList?.add?.(className);
    button.setAttribute?.("aria-busy", className === "is-busy" ? "true" : "false");
  }

  function restorePlaybackButton(button) {
    if (!button) {
      return;
    }

    if (button.dataset.originalLabel) {
      button.textContent = button.dataset.originalLabel;
    }
    button.classList?.remove?.("is-busy", "is-playing");
    button.removeAttribute?.("aria-busy");
  }

  function playbackButtons() {
    return [...(root?.querySelectorAll?.('[data-playback-control="true"]') || [])];
  }

  function ensureRoot() {
    if (host && root) {
      return;
    }

    host = document.createElement("saythis-overlay");
    root = host.attachShadow({ mode: "open" });
    document.documentElement.append(host);
  }

  function speak(result, rate, options = {}) {
    const trace = options.trace || createTrace(rate < 0.7 ? "overlay-slow" : "overlay-speak");
    const playbackOptions = ensurePlaybackOptions(options, rate);
    recordDebugEvent("ui:speak-click", trace, {
      rate,
      text: result?.query || result?.display || result?.sourceForm
    });

    if (!options.onlineChecked && !hasTopTierAudio(result) && !shouldPreferSpeechBeforeAudio(result)) {
      ensureSharedAudio(result, rate, {
        ...playbackOptions,
        trace
      }).then((sharedResult) => {
        if (!shouldPreferSpeechBeforeAudio(sharedResult) &&
            shouldPlayBeforeOnlineRefresh(result, sharedResult) &&
            playAudio(sharedResult, rate, trace, playbackOptions)) {
          return;
        }

        resolveOnline(sharedResult || result, {
          autoPlay: true,
          rate,
          trace
        });
      });
      return;
    }

    if (isSharedAudioCandidate(result)) {
      ensureSharedAudio(result, rate, {
        ...playbackOptions,
        trace
      }).then((sharedResult) => {
        if (playAudio(sharedResult, rate, trace, playbackOptions)) {
          return;
        }

        speakCandidate(fallbackSpeechResult(sharedResult), rate, { ...playbackOptions, skipSharedAudio: true, trace });
      });
      return;
    }

    if (!shouldPreferSpeechBeforeAudio(result) && playAudio(result, rate, trace, playbackOptions)) {
      return;
    }

    if (!options.onlineChecked && !shouldPreferSpeechBeforeAudio(result)) {
      resolveOnline(result, {
        autoPlay: true,
        rate,
        trace
      });
      return;
    }

    ensureSharedAudio(result, rate, { ...playbackOptions, trace }).then((sharedResult) => {
      if (!shouldPreferSpeechBeforeAudio(sharedResult) && playAudio(sharedResult, rate, trace, playbackOptions)) {
        return;
      }

      speakCandidate(fallbackSpeechResult(sharedResult), rate, { ...playbackOptions, skipSharedAudio: true, trace });
    });
  }

  function speakCandidate(result, rate, options = {}) {
    if (!result) {
      return;
    }

    const trace = options.trace || createTrace("overlay-speech-row");
    const playbackOptions = ensurePlaybackOptions(options, rate);
    recordDebugEvent("ui:result-speak-click", trace, {
      rate,
      text: result.query || result.sourceForm || result.display
    });

    if (!options.skipSharedAudio && isSharedAudioCandidate(result)) {
      ensureSharedAudio(result, rate, {
        ...playbackOptions,
        trace
      }).then((sharedResult) => {
        if (!shouldPreferSpeechBeforeAudio(sharedResult) && playAudio(sharedResult, rate, trace, playbackOptions)) {
          return;
        }

        speakCandidate(fallbackSpeechResult(sharedResult), rate, {
          ...playbackOptions,
          skipSharedAudio: true,
          trace
        });
      });
      return;
    }

    stopPlayback(playbackOptions.stopPrevious).then(() => sendOverlayMessage({
      type: "SAYTHIS_SPEAK",
      text: result.query || result.sourceForm || result.display,
      result,
      rate,
      trace,
      ...(options.skipSharedAudio ? { skipSharedAudio: true } : {})
    })).then((response) => {
      if (response?.ok) {
        markPlaybackStarted(
          playbackOptions.uiToken,
          playbackOptions.button,
          speechButtonLabel(result, response),
          speakingStatus(response, rate, result)
        );
      } else {
        failPlayback(playbackOptions.uiToken, response?.error || "Speech failed.");
      }
    });
  }

  function ensureSharedAudio(result, rate, options = {}) {
    if (!isSharedAudioCandidate(result)) {
      return Promise.resolve(result);
    }

    setStatus("Checking shared audio database.");
    setPlaybackButton(options.button, "Shared...", "is-busy");
    return responseWithinSharedAudioWait(sendOverlayMessage({
      type: "SAYTHIS_REQUEST_SHARED_AUDIO",
      text: result.query || result.display || result.sourceForm,
      result,
      rate,
      trace: options.trace
    })).then((response) => {
      if (!response?.ok || !getBestAudio(response.result)) {
        if (response?.timedOut) {
          recordDebugEvent("shared-audio:ui-timeout", options.trace, { rate });
          setStatus("No shared audio yet. Using speech fallback.");
        }
        return result;
      }

      if (options.replaceCurrent !== false) {
        renderOverlay(response.result);
      }
      return response.result;
    });
  }

  function playAudio(result, rate, trace, options = {}) {
    const audio = getBestAudio(result);
    return playAudioItem(audio, result, rate, { ...options, skipSharedAudio: true, trace });
  }

  function shouldPlayBeforeOnlineRefresh(originalResult, candidateResult) {
    const audio = getBestAudio(candidateResult);
    if (!audio?.url) {
      return false;
    }

    return candidateResult !== originalResult || isGeneratedAudioItem(audio);
  }

  function playAudioItem(audio, result, rate, options = {}) {
    if (!audio?.url) {
      return false;
    }

    const trace = options.trace || createTrace("overlay-audio-row");
    const playbackOptions = ensurePlaybackOptions(options, rate);
    recordDebugEvent("ui:audio-request", trace, {
      rate,
      quality: audio.quality,
      source: audio.source,
      urlHost: hostLabel(audio.url)
    });

    if (!options.skipSharedAudio && isGeneratedAudioItem(audio) && isSharedAudioCandidate(result)) {
      ensureSharedAudio(result, rate, options).then((sharedResult) => {
        const sharedAudio = getBestAudio(sharedResult);
        playAudioItem(sharedAudio || audio, sharedResult || result, rate, {
          ...playbackOptions,
          ...options,
          skipSharedAudio: true
        });
      });
      return true;
    }

    let fallbackStarted = false;
    const fallbackToSpeech = () => {
      if (fallbackStarted) {
        return;
      }

      fallbackStarted = true;
      setStatus("Audio failed. Using speech fallback.");
      const speechResult = fallbackSpeechResult(result);
      stopPlayback(playbackOptions.stopPrevious).then(() => sendOverlayMessage({
        type: "SAYTHIS_SPEAK",
        text: speechResult.query || speechResult.display,
        result: speechResult,
        rate,
        skipSharedAudio: true,
        trace
      })).then((response) => {
        if (response?.ok) {
          markPlaybackStarted(
            playbackOptions.uiToken,
            playbackOptions.button,
            speechButtonLabel(speechResult, response),
            speakingStatus(response, rate, speechResult)
          );
        } else {
          failPlayback(playbackOptions.uiToken, response?.error || "Speech failed.");
        }
      });
    };

    if (isGeneratedAudioItem(audio)) {
      stopPlayback(playbackOptions.stopPrevious).then(() => sendOverlayMessage({
        type: "SAYTHIS_PLAY_AUDIO",
        audio,
        rate,
        trace
      })).then((response) => {
        if (!response?.ok) {
          recordDebugEvent("audio:offscreen-error", trace, {
            error: response?.error || "Audio playback failed."
          });
          fallbackToSpeech();
          return;
        }

        recordDebugEvent("audio:offscreen-response", trace, response.playback || {});
        markPlaybackStarted(
          playbackOptions.uiToken,
          playbackOptions.button,
          rate < 0.7 ? "Playing slow" : "Playing",
          options.status || audioStartedStatus(audio, rate, elapsedMs(trace))
        );
      });
      return true;
    }

    stopPlayback(playbackOptions.stopPrevious).then(() => {
      audioPlayer = new Audio(audio.url);
      audioPlayer.playbackRate = rate < 0.7 ? 0.75 : 1;
      audioPlayer.addEventListener("error", () => {
        recordDebugEvent("audio:overlay-error", trace, {
          urlHost: hostLabel(audio.url)
        });
        fallbackToSpeech();
      });
      audioPlayer.play().then(() => {
        recordDebugEvent("audio:overlay-start", trace, {
          urlHost: hostLabel(audio.url)
        });
        markPlaybackStarted(
          playbackOptions.uiToken,
          playbackOptions.button,
          rate < 0.7 ? "Playing slow" : "Playing",
          options.status || audioStartedStatus(audio, rate, elapsedMs(trace))
        );
      }).catch(() => {
        recordDebugEvent("audio:overlay-error", trace, {
          urlHost: hostLabel(audio.url)
        });
        fallbackToSpeech();
      });
    });
    return true;
  }

  function isGeneratedAudioItem(audio = {}) {
    return String(audio.quality || "").trim().toLowerCase() === "generated";
  }

  function isSharedAudioCandidate(result = {}) {
    return sharedAudioCandidateForResult(result, result?.query || result?.display);
  }

  function stopAudio() {
    if (!audioPlayer) {
      return;
    }

    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer = null;
  }

  function stopPlayback(force = false) {
    stopAudio();
    if (!force) {
      return Promise.resolve({ ok: true });
    }

    playbackMayBeActive = false;
    return sendOverlayMessage({ type: "SAYTHIS_STOP" }).catch(() => ({ ok: false }));
  }

  function sendOverlayMessage(message) {
    if (typeof overlayRuntime.sendRuntimeMessage !== "function") {
      return Promise.resolve({ ok: false, error: "Runtime messaging unavailable." });
    }

    return overlayRuntime.sendRuntimeMessage(message, runtimeAdapters);
  }

  function recordDebugEvent(kind, trace, payload = {}) {
    if (!trace?.id || globalThis.__sayThisOverlayDebugEvents !== true) {
      return;
    }

    sendOverlayMessage({
      type: "SAYTHIS_DEBUG_EVENT",
      kind,
      payload: {
        ...payload,
        trace,
        elapsedMs: elapsedMs(trace)
      }
    }).catch(() => {});
  }

  function createTrace(action) {
    const startedAt = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return {
      id: `overlay-${startedAt.toString(36)}-${random}`,
      source: "overlay",
      action,
      startedAt
    };
  }

  function elapsedMs(trace) {
    return trace?.startedAt ? Math.max(0, Date.now() - Number(trace.startedAt)) : undefined;
  }

  function audioStartedStatus(audio, rate, ms) {
    const value = Number.isFinite(Number(ms)) ? ` in ${Math.round(Number(ms))} ms` : "";
    const source = playbackStatus({
      ...(audio || {}),
      kind: "audio"
    }, rate).replace(/\.$/, "");
    return `${source}${value}.`;
  }

  function hostLabel(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  function responseWithinSharedAudioWait(promise) {
    if (!sharedAudioUiWaitMs || typeof setTimeout !== "function") {
      return promise;
    }

    let timeoutId;
    return Promise.race([
      promise,
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve({ ok: false, timedOut: true }), sharedAudioUiWaitMs);
      })
    ]).finally(() => {
      clearTimeout(timeoutId);
    });
  }

  function normalizeUiWaitMs(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : fallback;
  }

  function speechButtonLabel(result, response) {
    if (response?.speech?.fallback === "audio") {
      return "Audio";
    }

    if (isGuideSpeechResult(result, response)) {
      return "Guide TTS";
    }

    if (response?.speech?.fallback === "web-speech") {
      return "Web Speech";
    }

    return "Browser TTS";
  }

  function speakingStatus(response, rate, result = {}) {
    if (response?.speech?.fallback === "audio") {
      return rate < 0.7 ? "Playing audio slowly." : "Playing audio.";
    }

    if (isGuideSpeechResult(result, response)) {
      return playbackStatus({ kind: "guide" }, rate);
    }

    if (response?.speech?.fallback === "web-speech") {
      const lang = normalizeText(result.ttsLang || response?.speech?.lang);
      return `Speaking with browser Web Speech${rate < 0.7 ? " slowly" : ""}${lang ? ` (${lang})` : ""}.`;
    }

    return playbackStatus({
      kind: "speech",
      label: result.speakText && result.speakText === result.query ? "Selected text speech" : "Source-form speech",
      lang: result.ttsLang || result.language
    }, rate);
  }

  function isGuideSpeechResult(result = {}, response = {}) {
    if (response?.speech?.fallback === "guide") {
      return true;
    }

    const speakText = normalizeText(result.speakText);
    const guide = normalizeText(result.pronunciation?.simple);
    return Boolean(speakText && guide && speakText === guide && normalizeText(result.ttsLang).toLowerCase().startsWith("en"));
  }

})();
