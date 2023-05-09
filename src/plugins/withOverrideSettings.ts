import {Editor, Element as SlateElement, Node, Point, Range, Transforms} from "slate";
import {Editor as CodeMirrorEditor} from "codemirror";
import {CodeBlockElement} from "../custom-types";
import {
  getClosestCurrentElement,
  getElementParent, getParentNodeByNode,
  isAtParagraphStart,
  isListItemElement,
  isParagraphElement
} from "../utils";

export const withOverrideSettings = (editor: Editor) => {
  const { isBlock, isVoid, isInline, deleteBackward, insertBreak } = editor;
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
  editor.deleteBackward = (unit) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => SlateElement.isElement(n) && editor.isBlock(n),
      });
      if (match) {
        const [, path] = match;
        const start = Editor.start(editor, path);
        if (Point.equals(selection.anchor, start)) {
          // 如果前一个是 code-block，删除当前 paragraph，将光标移动到 code-block 的末尾
          const prevPath = Editor.before(editor, path);
          if (prevPath) {
            const [prevMatch] = Editor.nodes(editor, {
              at: prevPath,
              match: n => SlateElement.isElement(n) && n.type === 'code-block',
            });
            if (prevMatch) {
              Editor.nodes(editor, {
                match: n => SlateElement.isElement(n) && n.type === 'paragraph',
              });
              Transforms.removeNodes(editor, { at: path });
              const [element] = prevMatch;
              const codeBlockMap = editor.codeBlockMap;
              const codeMirrorEditor = codeBlockMap.get((element as CodeBlockElement).uuid);
              codeMirrorEditor && codeMirrorEditor.focus();
              return;
            }
          }
        }
      }
    }
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => SlateElement.isElement(n) && n.type === 'header',
      });
      if (match) {
        const [, path] = match;
        const isStart = Editor.isStart(editor, selection.anchor, path);
        if (isStart) {
          // 将标题转换为 paragraph
          Transforms.setNodes(editor, {
            type: 'paragraph'
          });
          Transforms.unsetNodes(editor, 'level');
          return;
        }
      }
    }
    if (isAtParagraphStart(editor) && isListItemElement(getElementParent(editor)![0])) {
      // 如果是最后一个 list-item, wrap bulleted-list or numbered-list
      const curPara = getClosestCurrentElement(editor);
      const curList = getParentNodeByNode(curPara[0], editor);
      const curListWrapper = getParentNodeByNode(curList[0], editor)[0];
      if (curListWrapper.type !== 'bulleted-list' && curListWrapper.type !== 'numbered-list') {
        throw new Error('当前 list-item 的父节点不是 bulleted-list 或者 numbered-list');
      }
      const onlyOneChild = curListWrapper.children.length === 1;
      Transforms.unwrapNodes(editor, {
        match: n => SlateElement.isElement(n) && isListItemElement(n),
      });
      if (onlyOneChild) {
        Transforms.unwrapNodes(editor, {
          match: n => SlateElement.isElement(n) && n.type === curListWrapper.type,
        })
      }
      return;
    }
    deleteBackward(unit);
  }
  editor.insertBreak = () => {
    const [match] = Editor.nodes(editor, {
      match: n => n.type === 'header'
    })
    if (match) {
      insertBreak();
      Transforms.setNodes(editor, { type: 'paragraph' });
      Transforms.unsetNodes(editor, 'level');
      return;
    }
    const [listMatch] = Editor.nodes(editor, {
      match: n => SlateElement.isElement(n)  && n.type === 'list-item'
    });
    if (listMatch) {
      insertBreak();
      Transforms.wrapNodes(editor, { type: 'list-item', children: [] });
      Transforms.liftNodes(editor, {
        match: n => SlateElement.isElement(n) && n.type === 'list-item',
      });
      return;
    }
    insertBreak();
  }
  return editor;
}