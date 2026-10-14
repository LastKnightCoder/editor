import { Editor } from "slate";
import { createRoot, Root } from "react-dom/client";
import { createMentionPanelStore } from "../stores/createMentionPanelStore";
import { MentionPanelContext, MentionPanelStoreType } from "../stores/MentionPanelContext";
import MentionPanel from "../components/MentionPanel";
import DndProvider from "@/components/DndProvider";

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
export function createPanel(editor: Editor) {
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
    return (
      <DndProvider>
        <MentionPanelContext.Provider value={store}>
          <MentionPanel editor={editor} />
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

// 导出清理函数，供外部在需要时调用
export const cleanupMentionPanel = (editor: Editor) => {
  destroyPanel(editor);
};
