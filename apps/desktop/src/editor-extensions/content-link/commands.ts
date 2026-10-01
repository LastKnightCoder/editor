import type { Editor } from "slate";
import type { EditorCommand, EditorHotkey } from "@tau/editor";
import type { MentionPanelStoreType } from "./stores/MentionPanelContext";
import { editorPanels, cleanupMentionPanel } from "./plugins/withMentionCommands";

// 从 WeakMap 中获取 editor 对应的 store
const getEditorStore = (editor: Editor): MentionPanelStoreType | undefined => {
  const panelInfo = editorPanels.get(editor);
  return panelInfo?.store;
};

/** 提及面板（@）打开时的键盘管理。未命中时不拦默认 */
export const mentionCommands: EditorCommand[] = [
  {
    id: "host.content-link.mention-dismiss",
    title: "关闭提及面板",
    run: (editor, ctx) => {
      const store = getEditorStore(editor);
      if (!store) return;
      const { mentionPanelVisible, reset } = store.getState();
      if (!mentionPanelVisible) return;
      reset();
      // 卸载面板
      setTimeout(() => {
        cleanupMentionPanel(editor);
      }, 0);
      ctx.event?.preventDefault();
      ctx.event?.stopPropagation();
    },
  },
  {
    id: "host.content-link.mention-backspace",
    title: "提及面板删除字符",
    run: editor => {
      const store = getEditorStore(editor);
      if (!store) return;
      const { mentionPanelVisible, inputValue, setState, reset } = store.getState();
      if (!mentionPanelVisible) return;
      if (inputValue.length <= 1) {
        // 只剩 @ 时，关闭面板、让字符正常删除，并卸载面板
        reset();
        setTimeout(() => {
          cleanupMentionPanel(editor);
        }, 0);
        return;
      }
      // 删一个字符并更新面板位置
      setTimeout(() => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          setState({
            inputValue: inputValue.slice(0, inputValue.length - 1),
            position: {
              x: rect.left,
              y: rect.top + rect.height,
            },
          });
        }
      }, 0);
    },
  },
  {
    id: "host.content-link.mention-next",
    title: "提及面板下一项",
    run: (editor, ctx) => {
      const store = getEditorStore(editor);
      if (!store) return;
      const { mentionPanelVisible, setActiveIndex } = store.getState();
      if (!mentionPanelVisible) return;
      setActiveIndex(true);
      ctx.event?.preventDefault();
    },
  },
  {
    id: "host.content-link.mention-prev",
    title: "提及面板上一项",
    run: (editor, ctx) => {
      const store = getEditorStore(editor);
      if (!store) return;
      const { mentionPanelVisible, setActiveIndex } = store.getState();
      if (!mentionPanelVisible) return;
      setActiveIndex(false);
      ctx.event?.preventDefault();
    },
  },
  {
    id: "host.content-link.mention-confirm",
    title: "提及面板确认",
    run: (editor, ctx) => {
      const store = getEditorStore(editor);
      if (!store) return;
      const { mentionPanelVisible, selectItem, activeIndex } = store.getState();
      if (!mentionPanelVisible) return;
      selectItem(activeIndex);
      ctx.event?.preventDefault();
    },
  },
];

export const mentionHotkeys: EditorHotkey[] = [
  { key: "escape", command: "host.content-link.mention-dismiss" },
  { key: "backspace", command: "host.content-link.mention-backspace" },
  { key: "ArrowDown", command: "host.content-link.mention-next" },
  { key: "ArrowUp", command: "host.content-link.mention-prev" },
  { key: "enter", command: "host.content-link.mention-confirm" },
];
