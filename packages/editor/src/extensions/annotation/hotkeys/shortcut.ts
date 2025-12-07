import { IHotKeyConfig } from "../../../types";
import { insertAnnotation } from "../../../utils";

export const shortcut: IHotKeyConfig[] = [
  {
    hotKey: "mod+shift+n",
    action: (editor, event) => {
      insertAnnotation(editor, "注解内容");
      event.preventDefault();
    },
  },
];

export default shortcut;
