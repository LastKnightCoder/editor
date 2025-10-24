import { Editor } from "slate";
import { IHotKeyConfig } from "@/components/Editor/types";
import { MentionPanelStoreType } from "../stores/MentionPanelContext";
import {
  editorPanels,
  cleanupMentionPanel,
} from "../plugins/withMentionCommands";

// 从 WeakMap 中获取 editor 对应的 store
const getEditorStore = (editor: Editor): MentionPanelStoreType | undefined => {
  const panelInfo = editorPanels.get(editor);
  return panelInfo?.store;
};

export const mentionCommandConfig: IHotKeyConfig[] = [
  {
    hotKey: "esc",
    action: (editor, event) => {
      const store = getEditorStore(editor);
      if (!store) return;

      const { mentionPanelVisible, reset } = store.getState();
      if (mentionPanelVisible) {
        reset();
        // 卸载面板
        setTimeout(() => {
          cleanupMentionPanel(editor);
        }, 0);
        event.preventDefault();
        event.stopPropagation();
      }
    },
  },
  {
    hotKey: "backspace",
    action: (editor) => {
      const store = getEditorStore(editor);
      if (!store) return;

      const { mentionPanelVisible, inputValue, setState, reset } =
        store.getState();
      if (mentionPanelVisible) {
        if (inputValue.length <= 1) {
          // 只剩 @ 时，关闭面板、让字符正常删除，并卸载面板
          reset();
          // 延迟卸载，确保 reset 状态更新完成
          setTimeout(() => {
            cleanupMentionPanel(editor);
          }, 0);
          return;
        }
        // 其他情况：更新 store 状态，但让编辑器正常删除字符
        // 在下一个事件循环中获取更新后的位置
        setTimeout(() => {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const position = {
              x: rect.left,
              y: rect.top + rect.height,
            };
            setState({
              inputValue: inputValue.slice(0, inputValue.length - 1),
              position,
            });
          }
        }, 0);
      }
    },
  },
  {
    hotKey: "down",
    action: (editor, event) => {
      const store = getEditorStore(editor);
      if (!store) return;

      const { mentionPanelVisible, setActiveIndex } = store.getState();
      if (mentionPanelVisible) {
        setActiveIndex(true);
        event.preventDefault();
      }
    },
  },
  {
    hotKey: "up",
    action: (editor, event) => {
      const store = getEditorStore(editor);
      if (!store) return;

      const { mentionPanelVisible, setActiveIndex } = store.getState();
      if (mentionPanelVisible) {
        setActiveIndex(false);
        event.preventDefault();
      }
    },
  },
  {
    hotKey: "enter",
    action: (editor, event) => {
      const store = getEditorStore(editor);
      if (!store) return;

      const { mentionPanelVisible, selectItem, activeIndex } = store.getState();
      if (mentionPanelVisible) {
        selectItem(activeIndex);
        event.preventDefault();
      }
    },
  },
];
