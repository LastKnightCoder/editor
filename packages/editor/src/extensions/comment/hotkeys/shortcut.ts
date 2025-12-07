import { IHotKeyConfig } from "../../../types";
import { wrapComment } from "../../../utils";

export const shortcut: IHotKeyConfig[] = [
  {
    hotKey: "mod+shift+m",
    action: (editor, event) => {
      wrapComment(editor);
      event.preventDefault();
    },
  },
];
