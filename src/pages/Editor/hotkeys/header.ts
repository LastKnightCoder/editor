import {Editor, Element as SlateElement, Transforms} from "slate";
import {HeaderElement} from "../types";
import {HotKeyConfig} from "./types";

export const headerConfig: HotKeyConfig[] = [{
  hotKey: 'alt+=',
  action: (editor: Editor) => {
    // 如果是 header，增加 level
    // 如果是 paragraph，转换为 header
    const [match] = Editor.nodes(editor, {
      match: n => SlateElement.isElement(n) && (n.type === 'paragraph' || n.type === 'header')
    });
    if (!match) {
      return;
    }
    const [element, path] = match;
    if (element.type === 'header') {
      const headerElement = element as HeaderElement;
      const currentLevel = headerElement.level;
      if (currentLevel === 1) {
        return;
      }
      Transforms.setNodes(editor, { level: (currentLevel - 1) as HeaderElement['level'] }, { at: path });
    }
    if (element.type === 'paragraph') {
      Transforms.setNodes(editor, { type: 'header', level: 6 }, { at: path });
    }
  }
}, {
  hotKey: 'alt+-',
  action: (editor: Editor) => {
    // 如果是 header，减少 level
    const [match] = Editor.nodes(editor, {
      match: n => SlateElement.isElement(n) && n.type === 'header'
    });
    if (!match) {
      return;
    }
    const [element, path] = match;
    const headerElement = element as HeaderElement;
    const currentLevel = headerElement.level;
    if (currentLevel === 6) {
      // 如果是 h6，转换为 paragraph
      Transforms.setNodes(editor, { type: 'paragraph' }, { at: path });
      return;
    }
    Transforms.setNodes(editor, { level: (currentLevel + 1) as HeaderElement['level'] }, { at: path });
  }
}];