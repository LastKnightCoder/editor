import { useState, useCallback } from "react";
import type { MessageContentItem } from "@tau/shared";
import type WebSocketClient from "../../../utils/WebSocketClient";
import { useActiveTab } from "../../../hooks/useActiveTab";
import { PageHeader } from "./PageHeader";
import PageStream from "./stream/PageStream";
import ChatPage from "./pages/ChatPage";
import NotePage, { type NoteIntent } from "./pages/NotePage";
import HighlightsPage from "./pages/HighlightsPage";
import AllNotesPage from "./pages/AllNotesPage";
import SettingsPage from "./pages/SettingsPage";

/** 叠在本页流上的二级页 */
type Subpage =
  | { name: "chat"; pending?: MessageContentItem[] }
  /** 笔记按打开时的页面 URL 绑定：编辑途中切换标签页不会串到别的页面 */
  | { name: "note"; intent: NoteIntent; url: string }
  | { name: "highlights" }
  | { name: "allNotes" }
  | { name: "settings" };

/** 二级页退场动画时长（与 animate-slide-out-right 一致） */
const SLIDE_OUT_MS = 280;

interface MainLayoutProps {
  wsClient: WebSocketClient | null;
  aiClient: WebSocketClient | null;
  connecting: boolean;
  reconnect: () => void;
}

/**
 * 侧栏主布局：底层是当前网页的「本页」流（常驻，返回时保留滚动位置），
 * 对话、笔记编辑、全部高亮、全部笔记、设置从右侧滑入，顶栏「←」返回。
 */
export default function MainLayout({ wsClient, aiClient, connecting, reconnect }: MainLayoutProps) {
  const tab = useActiveTab();
  const [subpage, setSubpage] = useState<Subpage | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const open = useCallback((next: Subpage) => {
    setLeaving(false);
    setSubpage(next);
  }, []);

  const back = useCallback(() => {
    setLeaving(true);
    setTimeout(() => {
      setSubpage(null);
      setLeaving(false);
      setRefreshKey(key => key + 1);
    }, SLIDE_OUT_MS);
  }, []);

  /** 全部笔记里点某条：在当前标签页打开那个网页，再进入那篇笔记 */
  const openNoteFromAll = useCallback(async (noteUrl: string, noteId: string) => {
    try {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (active?.id) await chrome.tabs.update(active.id, { url: noteUrl });
    } catch (error) {
      console.error("Failed to navigate tab:", error);
    }
    setSubpage({ name: "note", intent: { type: "open", noteId }, url: noteUrl });
  }, []);

  const renderSubpage = (page: Subpage) => {
    switch (page.name) {
      case "chat":
        return (
          <ChatPage
            key={tab.url}
            wsClient={wsClient}
            url={tab.url}
            onBack={back}
            pendingMessage={page.pending ?? null}
            onPendingConsumed={() => setSubpage({ name: "chat" })}
          />
        );
      case "note":
        return (
          <NotePage
            key={`${page.url}-${page.intent.type === "open" ? page.intent.noteId : "new"}`}
            wsClient={wsClient}
            url={page.url}
            intent={page.intent}
            onBack={back}
          />
        );
      case "highlights":
        return <HighlightsPage url={tab.url} onBack={back} />;
      case "allNotes":
        return <AllNotesPage onBack={back} onNoteClick={openNoteFromAll} />;
      case "settings":
        return <SettingsPage onBack={back} />;
    }
  };

  return (
    <div className="bg-page text-ink-1 relative flex h-full flex-col overflow-hidden">
      <div
        className="flex h-full flex-col"
        style={{ display: subpage && !leaving ? "none" : "flex" }}
      >
        <PageHeader
          tab={tab}
          connecting={connecting}
          onAllNotes={() => open({ name: "allNotes" })}
          onSettings={() => open({ name: "settings" })}
          onReconnect={reconnect}
        />
        <PageStream
          wsClient={wsClient}
          aiClient={aiClient}
          url={tab.url}
          refreshKey={refreshKey}
          onOpenChat={pending => open({ name: "chat", ...(pending ? { pending } : {}) })}
          onOpenNote={intent => tab.url && open({ name: "note", intent, url: tab.url })}
          onOpenHighlights={() => open({ name: "highlights" })}
        />
      </div>

      {subpage && (
        <div
          className={`bg-page absolute inset-0 flex flex-col ${
            leaving ? "animate-slide-out-right" : "animate-slide-in-right"
          }`}
        >
          {renderSubpage(subpage)}
        </div>
      )}
    </div>
  );
}
