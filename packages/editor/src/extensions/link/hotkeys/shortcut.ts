import { IHotKeyConfig } from "../../../types";
import { wrapLink } from "../../../utils";

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
