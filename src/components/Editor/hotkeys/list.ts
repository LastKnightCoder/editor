import {HotKeyConfig} from "./types";
import {Editor, Transforms} from "slate";
import {getParentNodeByNode, getPreviousSiblingNode, isAtParagraphStart} from "../utils";
import {BulletedListElement, NumberedListElement} from "../types";
import {message} from "antd";

export const listConfig: HotKeyConfig[] = [{
  hotKey: 'Tab',
  action: (editor, event) => {
    const [match] = Editor.nodes(editor, {
      match: n => n.type === 'list-item'
    });
    const [para] = Editor.nodes(editor, {
      match: n => n.type === 'paragraph'
    })
    // 在段落的开头
    // 是第一个段落
    // 前面必须还有 list-item
    if (para && match && isAtParagraphStart(editor) && para[1][para[1].length - 1] === 0 && match[1][match[1].length - 1] !== 0) {
      const parent = getParentNodeByNode(editor, match[0]);
      const parentType = parent[0].type;
      if (!['bulleted-list', 'numbered-list'].includes(parentType)) {
        message.error('list-item 必须在 bulleted-list 或者 numbered-list 中');
        return;
      }
      // 上面保证过上一个 list 一定存在
      const previousSibling = getPreviousSiblingNode(editor, match[0])!;
      // 包裹为 bulleted-list 或 numbered-list，并包裹在上一个 list-item 中
      Transforms.wrapNodes(editor, {
        type: parentType as 'bulleted-list' | 'numbered-list',
        children: []
      }, {
        match: n => n.type === 'list-item'
      });
      // 放在最后面
      Transforms.moveNodes(editor, {
        match: n => n.type === parentType,
        to: [...previousSibling[1], (previousSibling[0]  as (BulletedListElement | NumberedListElement)).children.length]
      })
      event.preventDefault();
    }
  }
}];
