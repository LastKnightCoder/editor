import { IHotKeyConfig } from "@/components/Editor/types";
import { insertAnnotation } from "@/components/Editor/utils";

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
