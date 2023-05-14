import { Range, Transforms } from "slate";
import { HotKeyConfig } from "./types";

export const inline: HotKeyConfig[] = [{
  hotKey: 'left',
  action: (editor, event) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      event.preventDefault();
      Transforms.move(editor, { unit: 'offset', reverse: true });
    }
  }
}, {
  hotKey: 'right',
  action: (editor, event) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      event.preventDefault();
      Transforms.move(editor, { unit: 'offset' });
    }
  }
}]
