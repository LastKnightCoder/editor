import React, { useMemo, useState } from "react";
import "../../src/commands/contracts/install";
import { createRoot } from "react-dom/client";
import { App } from "antd";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { EditorProvider } from "@tau/editor/src";
import { createEditorRegistry } from "../../src/services/editorRegistry";
import { useDesktopEditorConfig } from "../../src/services/useDesktopEditorConfig";
import { createDesktopEditorExtensions } from "../../src/editor-extensions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationHost, ToastHost } from "@tau/ui";
import ContentEditor from "../../src/components/ContentEditor";
import CollaborativeTitle from "../../src/components/CollaborativeTitle";
import ContentCollaborationControl from "../../src/components/ContentCollaborationControl";
import JoinRequestNotifications from "../../src/components/JoinRequestNotifications";
import useSettingStore from "../../src/stores/useSettingStore";
import "../../src/tailwind.css";

useSettingStore.setState(state => ({
  setting: {
    ...state.setting,
    database: {
      ...state.setting.database,
      active: new URLSearchParams(location.search).get("databaseName") || "primary",
    },
  },
}));
const source = { sourceType: "article", sourceId: 1, sourceTitle: "协作测试标题" };
const queryClient = new QueryClient();
function View() {
  const [second, setSecond] = useState(true);
  // registry/config 引用稳定，避免重渲染时 Context value 失效
  const registry = useMemo(() => createEditorRegistry(), []);
  const extensions = useMemo(() => createDesktopEditorExtensions(), []);
  const editorConfig = useDesktopEditorConfig();
  return (
    <App>
      <QueryClientProvider client={queryClient}>
        <DndProvider backend={HTML5Backend}>
          <EditorProvider registry={registry} config={editorConfig} extensions={extensions}>
            <main style={{ padding: 24 }}>
              <CollaborativeTitle
                contentId={7}
                source={source}
                defaultValue="协作测试标题"
                contentEditable
                style={{ fontSize: 24, fontWeight: 600, marginBottom: 20 }}
              />
              <button onClick={() => setSecond(value => !value)}>
                {second ? "关闭第二个视图" : "打开第二个视图"}
              </button>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))",
                  gap: 24,
                  marginTop: 16,
                }}
              >
                <section data-testid="first-view" style={{ minHeight: 280 }}>
                  <ContentEditor
                    contentId={7}
                    source={source}
                    readonly={false}
                    collaborationControl={false}
                  />
                </section>
                {second && (
                  <section data-testid="second-view" style={{ minHeight: 280 }}>
                    <ContentEditor contentId={7} readonly={false} collaborationControl={false} />
                  </section>
                )}
              </div>
              <footer style={{ borderTop: "1px solid #ddd", padding: "6px 0" }}>
                <ContentCollaborationControl contentId={7} source={source} />
              </footer>
            </main>
            <JoinRequestNotifications />
            <NotificationHost />
            <ToastHost />
          </EditorProvider>
        </DndProvider>
      </QueryClientProvider>
    </App>
  );
}
createRoot(document.getElementById("root")!).render(<View />);
