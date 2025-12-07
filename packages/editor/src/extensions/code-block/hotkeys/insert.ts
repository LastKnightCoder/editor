import { IHotKeyConfig } from "../../../types";
import { insertCodeBlock, isCollapsed } from "../../../utils";

export const insert: IHotKeyConfig[] = [
  {
    hotKey: "mod+`",
    action: (editor) => {
      if (!isCollapsed(editor)) {
        return;
      }
      insertCodeBlock(editor, "javascript");
    },
  },
];
