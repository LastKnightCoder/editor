import { IHotKeyConfig } from "../../../types";
import { wrapInlineMath } from "../../../utils";

export const inlineShortcut: IHotKeyConfig[] = [
  {
    hotKey: "mod+shift+e",
    action: (editor, event) => {
      wrapInlineMath(editor);
      event.preventDefault();
    },
  },
];
