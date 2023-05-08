import {Editor} from "slate";
import {HotKeyConfig} from "../hotkeys/types";
import isHotKey from "is-hotkey";

export const registerHotKey = (editor: Editor, event: React.KeyboardEvent<HTMLDivElement>, configs: HotKeyConfig[]) => {
  for (const config of configs) {
    const { hotKey, action } = config;
    if (isHotKey(hotKey, event)) {
      action(editor);
    }
  }
}