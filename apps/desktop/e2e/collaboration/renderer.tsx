import React, { useMemo, useState } from "react";
import "../../src/commands/contracts/install";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationHost, ToastHost } from "@tau/ui";
import ContentEditor from "../../src/components/ContentEditor";
import CollaborativeTitle from "../../src/components/CollaborativeTitle";
import { SuggestionProposalCard } from "../../src/tool-call-renderers/SuggestionProposalCard";
import { useContentSuggestions } from "../../src/services/content-editing/suggestion-queries";
import ContentCollaborationControl from "../../src/components/ContentCollaborationControl";
import JoinRequestNotifications from "../../src/components/JoinRequestNotifications";
import useSettingStore from "../../src/stores/useSettingStore";
import useDynamicExtensionsStore from "../../src/stores/useDynamicExtensionsStore";
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
const coedit = new URLSearchParams(location.search).get("databaseName") === "coedit";
const source = { sourceType: "article", sourceId: 1, sourceTitle: "协作测试标题" };
const queryClient = new QueryClient();
function CoeditConversation() {
  const { data } = useContentSuggestions(7, "coedit");
  const ids = [...new Set((data ?? []).map(item => item.proposalId))];
  return (
    <aside aria-label="AI 对话">
      {ids.map(proposalId => (
        <SuggestionProposalCard
          key={proposalId}
          proposalId={proposalId}
          contentId={7}
          databaseName="coedit"
          isDark={false}
          waiting={false}
        />
      ))}
    </aside>
  );
}
function View() {
  const [second, setSecond] = useState(!coedit);
  return (
    <QueryClientProvider client={queryClient}>
      <DndProvider backend={HTML5Backend}>
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
                editingContext={coedit ? { entityType: "article", entityId: 1 } : undefined}
              />
            </section>
            {second && (
              <section data-testid="second-view" style={{ minHeight: 280 }}>
                <ContentEditor contentId={7} readonly={false} />
              </section>
            )}
          </div>
          {coedit ? <CoeditConversation /> : null}
          <footer style={{ borderTop: "1px solid #ddd", padding: "6px 0" }}>
            <ContentCollaborationControl contentId={7} source={source} presence={coedit} />
          </footer>
        </main>
        <JoinRequestNotifications />
        <NotificationHost />
        <ToastHost />
      </DndProvider>
    </QueryClientProvider>
  );
}
// 宿主扩展先装载再渲染（与 src/main.tsx 同序）：kit 只建一次，装载晚了补不回来
void useDynamicExtensionsStore
  .getState()
  .initExtensions()
  .then(() => {
    createRoot(document.getElementById("root")!).render(<View />);
  });
