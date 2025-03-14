import { Editor } from "slate";
import { IHotKeyConfig } from "../types";
import isHotKey from "is-hotkey";

export const registerHotKey = (
  editor: Editor,
  event: React.KeyboardEvent<HTMLDivElement>,
  configs: IHotKeyConfig[],
) => {
  for (const config of configs) {
    const { hotKey, action } = config;
    if (isHotKey(hotKey, event)) {
      action(editor, event);
    }
  }
};
