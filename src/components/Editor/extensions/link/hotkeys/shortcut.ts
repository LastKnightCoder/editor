import {HotKeyConfig} from "@/components/Editor/hotkeys/types.ts";
import {wrapLink} from "@/components/Editor/utils";

export const shortcut: HotKeyConfig[] = [{
  hotKey: 'mod+l',
  action: (editor, event) => {
    wrapLink(editor, '', true);
    event.preventDefault();
  }
}];

export default shortcut;