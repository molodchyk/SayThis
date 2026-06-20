(function installSayThisOverlayStyles() {
  globalThis.__sayThisOverlayStyles = `
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
          max-height: min(720px, calc(100vh - 36px));
          overflow: auto;
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

        .title-block {
          min-width: 0;
          flex: 1 1 auto;
        }

        .title-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
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
          overflow-wrap: anywhere;
          font-size: 20px;
          line-height: 1.2;
        }

        .listen-main {
          border: 1px solid #0f6b58;
          border-radius: 6px;
          padding: 5px 8px;
          color: #0f6b58;
          background: #ffffff;
          font: inherit;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
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

        .recordings {
          display: grid;
          gap: 6px;
          margin: 0 0 12px;
          padding: 0;
          list-style: none;
          color: #4d5a56;
          font-size: 12px;
        }

        .recordings li {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 8px;
        }

        .recordings button {
          border: 1px solid #0f6b58;
          border-radius: 6px;
          padding: 5px 8px;
          color: #0f6b58;
          background: transparent;
          font: inherit;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
        }

        [data-playback-control="true"].is-busy,
        [data-playback-control="true"].is-playing {
          color: #ffffff;
          background: #0f6b58;
        }

        [data-playback-control="true"]:disabled {
          opacity: 0.55;
          cursor: wait;
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
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 2px 8px;
          align-items: center;
          border-left: 2px solid #dcefe9;
          padding-left: 8px;
        }

        .alternates button {
          grid-row: span 2;
          border: 1px solid #0f6b58;
          border-radius: 6px;
          padding: 5px 8px;
          color: #0f6b58;
          background: transparent;
          font: inherit;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
        }

        .alternates strong {
          display: block;
          color: #16211f;
          font-weight: 750;
        }

        .actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .hint-field {
          display: grid;
          gap: 4px;
          margin: 0 0 8px;
          color: #65726d;
          font-size: 11px;
          font-weight: 750;
          text-transform: uppercase;
        }

        .hint-field input {
          box-sizing: border-box;
          min-width: 0;
          width: 100%;
          border: 1px solid #ccd6d1;
          border-radius: 6px;
          padding: 7px;
          color: #16211f;
          background: #ffffff;
          font: inherit;
          font-size: 12px;
          font-weight: 500;
          text-transform: none;
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

        .status {
          min-height: 16px;
          margin: 8px 0 0;
          color: #65726d;
          font-size: 11px;
        }

        [hidden] {
          display: none !important;
        }

        .correction-panel {
          border-top: 1px solid #d7ded9;
          margin-top: 10px;
          padding-top: 10px;
        }

        .correction-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .correction-panel label {
          display: grid;
          gap: 4px;
          color: #65726d;
          font-size: 11px;
          font-weight: 750;
          text-transform: uppercase;
        }

        .correction-panel label.full {
          grid-column: 1 / -1;
        }

        .correction-panel input {
          box-sizing: border-box;
          min-width: 0;
          width: 100%;
          border: 1px solid #ccd6d1;
          border-radius: 6px;
          padding: 7px;
          color: #16211f;
          background: #ffffff;
          font: inherit;
          font-size: 12px;
          font-weight: 500;
          text-transform: none;
        }

        .form-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 8px;
        }
  `;
})();
