(function installSayThisOverlay() {
  if (window.__sayThisOverlayReady) {
    return;
  }
  window.__sayThisOverlayReady = true;

  let host;
  let root;
  let audioPlayer;

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
    const evidence = (result.evidence || []).slice(0, 2);
    const sources = sourceItems(result).slice(0, 2);
    const alternates = alternateItems(result).slice(0, 2);
    const community = result.community || {};
    const communityText = [
      community.confirmations ? `${community.confirmations} confirmation${community.confirmations === 1 ? "" : "s"}` : "",
      community.corrections ? `${community.corrections} correction${community.corrections === 1 ? "" : "s"}` : ""
    ].filter(Boolean).join(" · ");

    root.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          inset: auto 18px 18px auto;
          z-index: 2147483647;
          width: min(360px, calc(100vw - 36px));
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #16211f;
        }

        .card {
          box-sizing: border-box;
          border: 1px solid #d7ded9;
          border-radius: 8px;
          padding: 12px;
          background: #ffffff;
          box-shadow: 0 14px 45px rgb(20 28 25 / 18%);
        }

        .head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .eyebrow {
          color: #65726d;
          font-size: 11px;
          font-weight: 750;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        h2 {
          margin: 2px 0 0;
          color: #16211f;
          font-size: 20px;
          line-height: 1.2;
        }

        .close {
          flex: 0 0 auto;
          border: 0;
          border-radius: 6px;
          width: 28px;
          height: 28px;
          color: #43504b;
          background: #edf1ef;
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
        }

        dl {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
          margin: 12px 0;
        }

        dt {
          color: #65726d;
          font-size: 11px;
          font-weight: 750;
          text-transform: uppercase;
        }

        dd {
          min-height: 18px;
          margin: 2px 0 0;
          color: #16211f;
          overflow-wrap: anywhere;
          font-size: 13px;
        }

        .badges {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin: 0 0 10px;
        }

        .badge {
          border-radius: 999px;
          padding: 3px 7px;
          color: #0b4236;
          background: #dcefe9;
          font-size: 11px;
          font-weight: 750;
          text-transform: capitalize;
        }

        .badge.subtle {
          color: #394641;
          background: #ecefeb;
        }

        .evidence {
          margin: 0 0 12px;
          padding-left: 18px;
          color: #4d5a56;
          font-size: 12px;
        }

        .sources {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 0 0 12px;
          padding: 0;
          list-style: none;
          font-size: 12px;
        }

        .sources a {
          color: #0f6b58;
          font-weight: 750;
          overflow-wrap: anywhere;
        }

        .alternates {
          display: grid;
          gap: 4px;
          margin: 0 0 12px;
          padding: 0;
          list-style: none;
          color: #4d5a56;
          font-size: 12px;
        }

        .alternates li {
          border-left: 2px solid #dcefe9;
          padding-left: 8px;
        }

        .alternates strong {
          display: block;
          color: #16211f;
          font-weight: 750;
        }

        .actions {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
        }

        button.action {
          border: 1px solid #0f6b58;
          border-radius: 6px;
          padding: 8px;
          color: #ffffff;
          background: #0f6b58;
          font: inherit;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
        }

        button.secondary {
          color: #0f6b58;
          background: transparent;
        }
      </style>
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
            <dt>Language</dt>
            <dd>${escapeHtml(result.languageName || result.language || "Unknown")}</dd>
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
        ${alternates.length ? `<ul class="alternates">${alternates.map((item) => `<li><strong>${escapeHtml(item.display || "Alternate")}</strong>${escapeHtml(item.summary)}</li>`).join("")}</ul>` : ""}
        ${sources.length ? `<ul class="sources">${sources.map((item) => `<li><a href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)}</a></li>`).join("")}</ul>` : ""}
        <div class="actions">
          <button class="action" type="button" data-action="speak">Speak</button>
          <button class="action secondary" type="button" data-action="slow">Slow</button>
          <button class="action secondary" type="button" data-action="wrong">Wrong</button>
        </div>
      </article>
    `;

    root.querySelector(".close").addEventListener("click", () => {
      stopAudio();
      host.remove();
      host = null;
      root = null;
    });

    root.querySelector('[data-action="speak"]').addEventListener("click", () => speak(result, 0.82));
    root.querySelector('[data-action="slow"]').addEventListener("click", () => speak(result, 0.62));
    root.querySelector('[data-action="wrong"]').addEventListener("click", () => {
      chrome.runtime.sendMessage({
        type: "SAYTHIS_FEEDBACK",
        text: result.query || result.display,
        feedback: { kind: "wrong" }
      });
    });

    if (options.autoPlay) {
      speak(result, 0.82);
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

    chrome.runtime.sendMessage({
      type: "SAYTHIS_SPEAK",
      text: result.query || result.display,
      result,
      rate
    });
  }

  function playAudio(result, rate) {
    const audio = getBestAudio(result);
    if (!audio?.url) {
      return false;
    }

    stopAudio();
    audioPlayer = new Audio(audio.url);
    audioPlayer.playbackRate = rate < 0.7 ? 0.75 : 1;
    audioPlayer.play().catch(() => {
      chrome.runtime.sendMessage({
        type: "SAYTHIS_SPEAK",
        text: result.query || result.display,
        result,
        rate
      });
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

  function alternateItems(result) {
    const alternates = Array.isArray(result?.alternateResults) ? result.alternateResults : [];
    return alternates
      .map((item) => {
        const sourceForm = normalizeText(item.sourceForm || item.display || item.query);
        const language = normalizeText(item.languageName || item.language);
        const source = normalizeText(item.sourceLabel || item.sourceStatus || item.confidence);
        const guide = normalizeText(item.pronunciation?.simple || item.pronunciation?.ipa);
        return {
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

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
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
