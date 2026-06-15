export const MENU_IDS = {
  pronounceSelection: "saythis-pronounce-selection",
  pronounceSelectionOnline: "saythis-pronounce-selection-online"
};

export function contextMenuDefinitions() {
  return [{
    id: MENU_IDS.pronounceSelection,
    title: "SayThis: pronounce \"%s\"",
    contexts: ["selection"]
  }, {
    id: MENU_IDS.pronounceSelectionOnline,
    title: "SayThis: online lookup and pronounce \"%s\"",
    contexts: ["selection"]
  }];
}

export function resolveOptionsForMenuId(menuId) {
  if (menuId === MENU_IDS.pronounceSelectionOnline) {
    return {
      ok: true,
      source: "context-menu-online",
      options: { useOnline: true }
    };
  }

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
