import { Editor } from "slate";
import { createRoot, Root } from "react-dom/client";
import { createMentionPanelStore } from "../stores/createMentionPanelStore";
import {
  MentionPanelContext,
  MentionPanelStoreType,
} from "../stores/MentionPanelContext";
import MentionPanel from "../components/MentionPanel";
import DndProvider from "@/components/DndProvider";
import useDynamicExtensions from "@/hooks/useDynamicExtensions";

// 存储每个 editor 的面板信息
export const editorPanels = new WeakMap<
  Editor,
  {
    container: HTMLDivElement;
    root: Root;
    store: MentionPanelStoreType;
  }
>();

// 创建面板
function createPanel(editor: Editor) {
  const existing = editorPanels.get(editor);
  if (existing) {
    return existing;
  }

  // 创建容器
  const container = document.createElement("div");
  container.id = `mention-panel-${Math.random().toString(36).substr(2, 9)}`;
  document.body.appendChild(container);

  // 创建 store
  const store = createMentionPanelStore(editor);

  // 创建 root 并渲染
  const root = createRoot(container);

  // 包装组件以提供 context
  const PanelWrapper = () => {
    const extensions = useDynamicExtensions();
    return (
      <DndProvider>
        <MentionPanelContext.Provider value={store}>
          <MentionPanel extensions={extensions} editor={editor} />
        </MentionPanelContext.Provider>
      </DndProvider>
    );
  };

  root.render(<PanelWrapper />);

  const panelInfo = { container, root, store };
  editorPanels.set(editor, panelInfo);

  return panelInfo;
}

// 销毁面板
function destroyPanel(editor: Editor) {
  const panelInfo = editorPanels.get(editor);
  if (panelInfo) {
    panelInfo.root.unmount();
    if (panelInfo.container.parentNode) {
      panelInfo.container.parentNode.removeChild(panelInfo.container);
    }
    editorPanels.delete(editor);
  }
}

export const withMentionCommands = (editor: Editor) => {
  const { insertText } = editor;

  editor.insertText = (text) => {
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
    } else {
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
    }

    insertText(text);
  };

  return editor;
};

// 导出清理函数，供外部在需要时调用
export const cleanupMentionPanel = (editor: Editor) => {
  destroyPanel(editor);
};
