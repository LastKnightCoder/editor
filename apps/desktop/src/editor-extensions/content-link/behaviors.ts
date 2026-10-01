import { Editor, Element, Transforms } from "slate";
import type { ParagraphElement } from "@tau/editor";
import type { ElementBehaviors } from "@tau/editor";

import type { ContentLinkElement } from "./types";
import { editorPanels, createPanel } from "./plugins/withMentionCommands";

/** content-link 不在 paragraph 里时包进 paragraph（行内元素的标准归位） */
const normalize: ElementBehaviors<ContentLinkElement>["normalize"] = (editor, [node, path]) => {
  const parentPath = path.slice(0, path.length - 1);
  const parentNode = Editor.node(editor, parentPath);
  if (path.length === 0 || (parentNode && parentNode[0].type !== "paragraph")) {
    const paragraphNode: ParagraphElement = {
      type: "paragraph",
      children: [node as ContentLinkElement],
    };
    Transforms.wrapNodes(editor, paragraphNode, {
      at: path,
    });
    return true;
  }
  return false;
};

/**
 * 段落里输入 @ 打开提及面板；面板已开时其他输入更新面板、空格关闭。
 * 文本插入本身交给默认行为（返回 false），这里只管面板。
 */
const insertMention: ElementBehaviors<ParagraphElement>["insertText"] = (editor, _entry, text) => {
  if (text === "@") {
    // 动态创建面板
    const { store } = createPanel(editor);
    const state = store.getState();

    if (!state.mentionPanelVisible) {
      // 获取当前光标的位置
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
          inputValue: "@",
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
    const { mentionPanelVisible, inputValue } = state;

    if (mentionPanelVisible) {
      if (text === " ") {
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

// Element/Transforms 的引用避免 tree-shake 误判（normalize 用到）
void Element;
void Transforms;
