import { Editor } from "slate";
import {Editor as CodeMirrorEditor} from "codemirror";


export const withOverrideSettings = (editor: Editor) => {
  const { isBlock, isVoid, isInline } = editor;
  editor.isBlock = (element) => {
    const blockTypes = ['paragraph', 'header', 'callout', 'bulleted-list', 'numbered-list', 'code-block', 'image'];
    return blockTypes.includes(element.type) ? true : isBlock(element);
  }
  editor.isVoid = (element) => {
    const voidTypes = ['code-block', 'image'];
    return voidTypes.includes(element.type) ? true : isVoid(element);
  }
  editor.isInline = (element) => {
    const inlineTypes = ['formatted', 'link'];
    return inlineTypes.includes(element.type) ? true : isInline(element);
  }
  editor.codeBlockMap = new Map<string, CodeMirrorEditor>();
  return editor;
}