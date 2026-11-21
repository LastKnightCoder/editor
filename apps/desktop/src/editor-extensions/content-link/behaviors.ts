import { Editor, Element, Range, Text, Transforms } from "slate";
import { createParagraph, type ParagraphElement, type ElementBehaviors } from "@tau/editor/api";

import type { ContentLinkElement } from "./types";
import { resolveMentionTrigger } from "./triggers";
import { editorPanels, createPanel } from "./plugins/withMentionCommands";

/** 只有落在根节点或块级子节点之间的引用才需要补段落。 */
const normalize: ElementBehaviors<ContentLinkElement>["normalize"] = (editor, [, path]) => {
  const [parent] = Editor.parent(editor, path);
  if (
    Element.isElement(parent) &&
    (parent.type === "paragraph" ||
      parent.type === "header" ||
      editor.isInline(parent) ||
      parent.children.some(Text.isText))
  )
    return false;
  Transforms.wrapNodes(editor, createParagraph(), { at: path });
  return true;
};

/** 光标前一个字符（可跨文本节点），用于识别 [[ / 【【 的成对输入 */
const getCharBeforeCursor = (editor: Editor): string => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return "";
  const before = Editor.before(editor, selection, { unit: "character" });
  if (!before) return "";
  return Editor.string(editor, { anchor: before, focus: selection.anchor }).slice(-1);
};

/**
 * 段落里输入 @ / [[ / 【【 打开提及面板；面板已开时其他输入更新面板、空格关闭
 * （wiki 触发词允许空格进搜索词，对齐 Obsidian）。
 * 文本插入本身交给默认行为（返回 false），这里只管面板。
 */
const insertMention: ElementBehaviors<ParagraphElement>["insertText"] = (editor, _entry, text) => {
  const trigger = resolveMentionTrigger(text, getCharBeforeCursor(editor));
  if (trigger) {
    // 动态创建面板
    const { store } = createPanel(editor);
    const state = store.getState();

    if (!state.mentionPanelVisible) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const position = {
          x: rect.left,
          y: rect.top + rect.height,
        };
        store.setState({
          mentionPanelVisible: true,
          position,
          inputValue: trigger,
          trigger,
        });
      }
    }
    return false;
  }

  // 如果面板已存在，更新输入
  const panelInfo = editorPanels.get(editor);
  if (panelInfo) {
    const { store } = panelInfo;
    const state = store.getState();
    const { mentionPanelVisible, inputValue, trigger: activeTrigger } = state;

    if (mentionPanelVisible) {
      if (text === " " && activeTrigger === "@") {
        store.getState().reset();
      } else {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const position = {
            x: rect.left,
            y: rect.top + rect.height,
          };
          store.setState({
            inputValue: inputValue + text,
            position,
          });
        }
      }
    }
  }
  return false;
};

export const contentLinkBehaviors: ElementBehaviors<ContentLinkElement> = {
  normalize,
};

export const contentLinkForParagraph: ElementBehaviors<ParagraphElement> = {
  insertText: insertMention,
};
