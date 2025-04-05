import { IHotKeyConfig } from "@/components/Editor/types";
import { wrapComment } from "@/components/Editor/utils";

export const shortcut: IHotKeyConfig[] = [
  {
    hotKey: "mod+shift+m",
    action: (editor, event) => {
      wrapComment(editor);
      event.preventDefault();
    },
  },
];
