import { IHotKeyConfig } from "@/components/Editor/types";
import { wrapInlineMath } from "@/components/Editor/utils";

export const inlineShortcut: IHotKeyConfig[] = [{
  hotKey: 'mod+shift+e',
  action: (editor, event) => {
    wrapInlineMath(editor);
    event.preventDefault();
  }
}]