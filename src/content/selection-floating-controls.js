(function installSayThisSelectionFloatingControls() {
  const STATUS_HIDE_MS = 1500;

  function createSelectionFloatingControls(options = {}) {
    const documentRef = options.document || document;
    const windowRef = options.window || window;
    const onPlay = typeof options.onPlay === "function" ? options.onPlay : () => {};
    let statusHost = null;
    let statusRoot = null;
    let statusTimerId = null;
    let playButtonHost = null;
    let playButtonRoot = null;

    return {
      showStatus,
      hideStatus,
      showPlayButton,
      hidePlayButton
    };

    function showStatus(selectedText, label, showOptions = {}) {
      const root = ensureRoot("saythis-selection-status", "status");
      if (!root) {
        return;
      }

      const position = selectionStatusPosition();
      root.innerHTML = `
        <style>
          :host {
            all: initial;
            position: fixed;
            left: ${Math.round(position.left)}px;
            top: ${Math.round(position.top)}px;
            z-index: 2147483647;
            pointer-events: none;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          .pill {
            box-sizing: border-box;
            max-width: min(260px, calc(100vw - 24px));
            border: 1px solid #0f6b58;
            border-radius: 999px;
            padding: 5px 8px;
            color: #ffffff;
            background: #0f6b58;
            box-shadow: 0 8px 24px rgb(20 28 25 / 20%);
            font-size: 12px;
            font-weight: 750;
            line-height: 1.2;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        </style>
        <div class="pill" role="status" aria-live="polite">${escapeHtml(label)} - ${escapeHtml(selectedText)}</div>
      `;

      if (statusTimerId !== null) {
        clearTimeout(statusTimerId);
        statusTimerId = null;
      }

      if (showOptions.autoHide) {
        statusTimerId = setTimeout(hideStatus, STATUS_HIDE_MS);
      }
    }

    function hideStatus() {
      statusTimerId = null;
      statusHost?.remove?.();
      statusHost = null;
      statusRoot = null;
    }

    function showPlayButton(selectedText) {
      const root = ensureRoot("saythis-selection-play-button", "play");
      if (!root) {
        return;
      }

      const position = selectionPlayButtonPosition();
      root.innerHTML = `
        <style>
          :host {
            all: initial;
            position: fixed;
            left: ${Math.round(position.left)}px;
            top: ${Math.round(position.top)}px;
            z-index: 2147483647;
            pointer-events: auto;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          button {
            box-sizing: border-box;
            width: 32px;
            height: 32px;
            border: 1px solid #0f6b58;
            border-radius: 999px;
            padding: 0;
            color: #ffffff;
            background: #0f6b58;
            box-shadow: 0 8px 24px rgb(20 28 25 / 24%);
            font: 750 14px/1 Inter, ui-sans-serif, system-ui, sans-serif;
            cursor: pointer;
          }
          button:focus-visible {
            outline: 2px solid #ffffff;
            outline-offset: 2px;
          }
        </style>
        <button type="button" title="SayThis: play selected text" aria-label="SayThis: play ${escapeHtml(selectedText)}">&#9658;</button>
      `;

      root.querySelector?.("button")?.addEventListener?.("click", (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        onPlay();
      });
    }

    function hidePlayButton() {
      playButtonHost?.remove?.();
      playButtonHost = null;
      playButtonRoot = null;
    }

    function ensureRoot(tagName, kind) {
      if (kind === "status" && statusRoot && statusHost) {
        return statusRoot;
      }

      if (kind === "play" && playButtonRoot && playButtonHost) {
        return playButtonRoot;
      }

      if (typeof documentRef.createElement !== "function" || !documentRef.documentElement?.append) {
        return null;
      }

      const host = documentRef.createElement(tagName);
      const root = host.attachShadow?.({ mode: "open" });
      if (!root) {
        return null;
      }

      documentRef.documentElement.append(host);
      if (kind === "status") {
        statusHost = host;
        statusRoot = root;
      } else {
        playButtonHost = host;
        playButtonRoot = root;
      }
      return root;
    }

    function selectionStatusPosition() {
      const rect = selectionClientRect();
      const viewportWidth = Number(windowRef.innerWidth) || 360;
      const viewportHeight = Number(windowRef.innerHeight) || 640;
      const left = rect
        ? Math.min(Math.max(12, rect.left), Math.max(12, viewportWidth - 272))
        : 12;
      const top = rect
        ? Math.min(Math.max(12, rect.bottom + 8), Math.max(12, viewportHeight - 42))
        : 12;
      return { left, top };
    }

    function selectionPlayButtonPosition() {
      const rect = selectionClientRect();
      const viewportWidth = Number(windowRef.innerWidth) || 360;
      const viewportHeight = Number(windowRef.innerHeight) || 640;
      const left = rect
        ? Math.min(Math.max(8, rect.left - 2), Math.max(8, viewportWidth - 40))
        : 8;
      const preferredTop = rect ? rect.top - 36 : 8;
      const fallbackTop = rect ? rect.bottom + 6 : 8;
      const top = preferredTop >= 8
        ? preferredTop
        : Math.min(Math.max(8, fallbackTop), Math.max(8, viewportHeight - 40));
      return { left, top };
    }

    function selectionClientRect() {
      try {
        const selection = windowRef.getSelection?.();
        if (!selection || selection.isCollapsed || !selection.rangeCount) {
          return null;
        }

        const rect = selection.getRangeAt(0)?.getBoundingClientRect?.();
        return rect && Number.isFinite(rect.left) && Number.isFinite(rect.bottom)
          ? rect
          : null;
      } catch {
        return null;
      }
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

  globalThis.__sayThisSelectionFloatingControls = {
    createSelectionFloatingControls
  };
})();
