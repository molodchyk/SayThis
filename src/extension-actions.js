export const MENU_IDS = {
  pronounceSelection: "saythis-pronounce-selection"
};

export function contextMenuDefinitions(settings = {}) {
  if (settings.contextMenuEnabled === false) {
    return [];
  }

  return [{
    id: MENU_IDS.pronounceSelection,
    title: "SayThis: pronounce \"%s\"",
    contexts: ["selection"]
  }];
}

export function resolveOptionsForMenuId(menuId) {
  if (menuId === MENU_IDS.pronounceSelection) {
    return {
      ok: true,
      source: "context-menu",
      options: {}
    };
  }

  return {
    ok: false,
    source: "",
    options: {}
  };
}
