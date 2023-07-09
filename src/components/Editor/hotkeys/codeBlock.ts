import { HotKeyConfig } from "./types";
import {insertCodeBlock, isCollapsed} from "../utils";


export const codeBlockConfig: HotKeyConfig[] = [{
  hotKey: 'mod+`',
  action: (editor) => {
    if (!isCollapsed(editor)) {
      return;
    }
    insertCodeBlock(editor, 'javascript');
  }
}]