import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = fileURLToPath(new URL("../..", import.meta.url));

export async function installSelectionListener(options = {}) {
  const adapterSource = await readFile(
    join(root, "src", "content", "selection-runtime-adapters.js"),
    "utf8"
  );
  const floatingControlsSource = await readFile(
    join(root, "src", "content", "selection-floating-controls.js"),
    "utf8"
  );
  const source = await readFile(join(root, "src", "selection-listener.js"), "utf8");
  const listeners = new Map();
  const sentMessages = [];
  const hosts = [];
  let storageListener = null;
  let selectedText = "";
  let activeElement = null;

  const context = {
    globalThis: {},
    window: {
      getSelection: () => ({
        isCollapsed: !selectedText,
        anchorNode: {},
        focusNode: {},
        rangeCount: selectedText ? 1 : 0,
        toString: () => selectedText,
        getRangeAt: () => ({
          getBoundingClientRect: () => options.selectionRect || ({
            left: 30,
            top: 80,
            right: 120,
            bottom: 104
          })
        })
      }),
      innerWidth: 800,
      innerHeight: 600
    },
    document: {
      visibilityState: "visible",
      get activeElement() {
        return activeElement;
      },
      documentElement: {
        append: (host) => {
          hosts.push(host);
        }
      },
      createElement: (tagName) => createFakeHost(tagName),
      addEventListener: (type, listener) => {
        const existing = listeners.get(type) || [];
        existing.push(listener);
        listeners.set(type, existing);
      }
    },
    chrome: {
      runtime: {
        sendMessage: (message) => {
          sentMessages.push(message);
          return Promise.resolve(options.runtimeResponse || { ok: true });
        }
      },
      storage: {
        local: {
          get: async () => {
            const settings = options.settingsPromise
              ? await options.settingsPromise
              : options.settings || { selectToHear: true };
            return { settings };
          }
        },
        onChanged: {
          addListener: (listener) => {
            storageListener = listener;
          }
        }
      }
    },
    setTimeout,
    clearTimeout,
    Date: options.Date || Date,
    Math,
    Number,
    Object,
    Promise,
    RegExp,
    String
  };
  context.globalThis = context;

  vm.runInNewContext(adapterSource, context, {
    filename: "src/content/selection-runtime-adapters.js"
  });
  vm.runInNewContext(floatingControlsSource, context, {
    filename: "src/content/selection-floating-controls.js"
  });
  vm.runInNewContext(source, context, {
    filename: "src/selection-listener.js"
  });
  await delay(0);

  return {
    sentMessages,
    setSelection(value) {
      selectedText = value;
    },
    setActiveElement(element) {
      activeElement = element;
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) {
        listener(event);
      }
    },
    dispatchStorageChange(settings) {
      storageListener?.({
        settings: {
          newValue: settings
        }
      }, "local");
    },
    get selectionPlayButtonRoot() {
      return hosts.find((host) => host.tagName === "saythis-selection-play-button" && !host.removed)?.shadowRoot || null;
    },
    clickSelectionPlayButton() {
      this.selectionPlayButtonRoot?.button?.click?.();
    }
  };
}

export function overlayNode(tagName = "span") {
  return {
    tagName,
    getRootNode: () => ({
      host: {
        tagName: "saythis-overlay"
      }
    })
  };
}

function createFakeHost(tagName) {
  const host = {
    tagName,
    removed: false,
    shadowRoot: null,
    attachShadow: () => {
      const root = createFakeShadowRoot();
      host.shadowRoot = root;
      return root;
    },
    remove: () => {
      host.removed = true;
    }
  };
  return host;
}

function createFakeShadowRoot() {
  const root = {
    innerHTML: "",
    button: null,
    querySelector(selector) {
      if (selector !== "button") {
        return null;
      }

      if (!this.button) {
        this.button = fakeButton();
      }

      return this.button;
    }
  };
  return root;
}

function fakeButton() {
  let clickListener = null;
  return {
    addEventListener(type, listener) {
      if (type === "click") {
        clickListener = listener;
      }
    },
    click() {
      clickListener?.({
        preventDefault() {},
        stopPropagation() {}
      });
    }
  };
}
