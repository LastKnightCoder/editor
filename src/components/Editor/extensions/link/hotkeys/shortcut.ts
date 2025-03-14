import { IHotKeyConfig } from "@/components/Editor/types";
import { wrapLink } from "@/components/Editor/utils";

export const shortcut: IHotKeyConfig[] = [
  {
    hotKey: "mod+l",
    action: (editor, event) => {
      wrapLink(editor, "", true);
      event.preventDefault();
    },
  },
];

export default shortcut;
