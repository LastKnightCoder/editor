import { Editor } from "slate";
import { IHotKeyConfig } from "@/components/Editor/types";
import { MentionPanelStoreType } from "../stores/MentionPanelContext";
import { editorPanels } from "../plugins/withMentionCommands";

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

      const { mentionPanelVisible, inputValue, setState, setSearchResults } =
        store.getState();
      if (mentionPanelVisible) {
        if (inputValue.length <= 1) {
          // 只剩 @ 时，清空搜索结果但保持面板打开
          setSearchResults([]);
          return;
        }
        // 获取当前光标的位置
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
