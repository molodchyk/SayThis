import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const resultViewSource = await readFile(join(process.cwd(), "src/content/overlay-result-view.js"), "utf8");
export const overlaySource = await readFile(join(process.cwd(), "src/content-overlay.js"), "utf8");

export function createFakeDom() {
  const state = {
    root: null
  };

  const document = {
    createElement(tagName) {
      return {
        tagName,
        attachShadow() {
          state.root = new FakeRoot();
          return state.root;
        },
        remove() {}
      };
    },
    documentElement: {
      append() {}
    }
  };

  return {
    get root() {
      return state.root;
    },
    document
  };
}

export async function flushPromises(turns = 6) {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

class FakeRoot {
  constructor() {
    this.elements = new Map();
    this.recordingButtons = [];
    this.alternateButtons = [];
    this.correctionFields = [];
    this.html = "";
  }

  set innerHTML(value) {
    this.html = String(value || "");
    this.elements = new Map([
      [".close", new FakeElement()],
      [".status", new FakeElement()],
      ["[data-action=\"speak\"]", new FakeElement()],
      ["[data-action=\"online\"]", new FakeElement()],
      ["[data-action=\"slow\"]", new FakeElement()],
      ["[data-action=\"correct\"]", new FakeElement()],
      ["[data-action=\"confirm\"]", new FakeElement()],
      ["[data-action=\"missing\"]", new FakeElement()],
      ["[data-action=\"wrong\"]", new FakeElement()],
      ["[data-action=\"cancel-correction\"]", new FakeElement()],
      ["[data-correction]", new FakeFormElement()],
      ["[data-lookup-hints]", new FakeElement()]
    ]);
    this.recordingButtons = [...this.html.matchAll(/data-action="recording" data-audio-index="(\d+)"/g)]
      .map((match) => new FakeElement({ audioIndex: match[1] }));
    this.alternateButtons = [...this.html.matchAll(/data-action="alternate" data-alternate-index="(\d+)"/g)]
      .map((match) => new FakeElement({ alternateIndex: match[1] }));
    this.correctionFields = [...this.html.matchAll(/data-correction-field="([^"]+)"/g)]
      .map((match) => new FakeElement({ correctionField: match[1] }));
  }

  get innerHTML() {
    return this.html;
  }

  querySelector(selector) {
    return this.elements.get(selector) || null;
  }

  querySelectorAll(selector) {
    if (selector === '[data-action="recording"]') {
      return this.recordingButtons;
    }

    if (selector === '[data-action="alternate"]') {
      return this.alternateButtons;
    }

    if (selector === "[data-correction-field]") {
      return this.correctionFields;
    }

    return [];
  }
}

class FakeElement {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.events = {};
    this.hidden = false;
    this.textContent = "";
    this.value = "";
  }

  addEventListener(name, callback) {
    this.events[name] = callback;
  }

  click() {
    this.events.click?.({
      preventDefault() {}
    });
  }

  focus() {}
}

class FakeFormElement extends FakeElement {
  querySelector() {
    return new FakeElement();
  }
}
