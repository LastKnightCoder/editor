import { useState, useCallback } from "react";
import type WebSocketClient from "../../../utils/WebSocketClient";
import type {
  ThemeMode,
  ResolvedTheme,
  TabType,
  PageType,
} from "../../../utils/types";
import { useActiveTabUrl } from "../../../hooks/useActiveTabUrl";
import Header from "./Header";
import SettingsPage from "./SettingsPage";
import AllNotesPage from "./AllNotesPage";
import TabBar from "./TabBar";
import OverviewTab from "./tabs/OverviewTab";
import ChatTab from "./tabs/ChatTab";
import NotesTab from "./tabs/NotesTab";

interface MainLayoutProps {
  wsClient: WebSocketClient | null;
  reconnect: () => void;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  onThemeModeChange: (mode: ThemeMode) => void;
}

/**
 * 主布局组件
 * 管理页面栈导航和 Tab 切换
 */
export default function MainLayout({
  wsClient,
  reconnect,
  themeMode,
  resolvedTheme,
  onThemeModeChange,
}: MainLayoutProps) {
  const { url } = useActiveTabUrl();
  const [currentTab, setCurrentTab] = useState<TabType>("overview");
  const [currentPage, setCurrentPage] = useState<PageType>("main");
  const [pageAnimating, setPageAnimating] = useState(false);
  const [pageDirection, setPageDirection] = useState<"in" | "out">("in");

  const navigateTo = useCallback((page: PageType) => {
    setPageDirection("in");
    setPageAnimating(true);
    setCurrentPage(page);
  }, []);

  const navigateBack = useCallback(() => {
    setPageDirection("out");
    setPageAnimating(true);
    setTimeout(() => {
      setCurrentPage("main");
      setPageAnimating(false);
    }, 280);
  }, []);

  const handleAnimationEnd = useCallback(() => {
    if (pageDirection === "in") {
      setPageAnimating(false);
    }
  }, [pageDirection]);

  const renderTabContent = () => {
    switch (currentTab) {
      case "overview":
        return <OverviewTab key={url} wsClient={wsClient} url={url} />;
      case "chat":
        return <ChatTab key={url} wsClient={wsClient} url={url} />;
      case "notes":
        return (
          <NotesTab
            wsClient={wsClient}
            resolvedTheme={resolvedTheme}
            url={url}
          />
        );
    }
  };

  /** 渲染滑入页面的内容 */
  const renderOverlayPage = () => {
    switch (currentPage) {
      case "settings":
        return (
          <SettingsPage
            themeMode={themeMode}
            onThemeModeChange={onThemeModeChange}
            onBack={navigateBack}
          />
        );
      case "allNotes":
        return <AllNotesPage onBack={navigateBack} />;
      default:
        return null;
    }
  };

  const isOverlayVisible = currentPage !== "main";

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-white dark:bg-[#161b22]">
      {/* 主页面层 */}
      <div
        className={`flex h-full flex-col transition-transform duration-300 ease-in-out ${
          isOverlayVisible && !pageAnimating
            ? "-translate-x-1/4 opacity-0"
            : isOverlayVisible && pageDirection === "in"
              ? "-translate-x-1/4 opacity-0"
              : "translate-x-0 opacity-100"
        }`}
        style={{
          display: isOverlayVisible && !pageAnimating ? "none" : "flex",
        }}
      >
        <Header
          onSettingsClick={() => navigateTo("settings")}
          onReloadClick={reconnect}
        />
        <div className="flex min-h-0 flex-1 flex-col">{renderTabContent()}</div>
        <TabBar
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          onAllNotesClick={() => navigateTo("allNotes")}
        />
      </div>

      {/* 滑入覆盖层（设置 / 全部笔记等） */}
      {isOverlayVisible && (
        <div
          className={`absolute inset-0 flex flex-col bg-white dark:bg-[#161b22] ${
            pageDirection === "in"
              ? "animate-slide-in-right"
              : "animate-slide-out-right"
          }`}
          onAnimationEnd={handleAnimationEnd}
        >
          {renderOverlayPage()}
        </div>
      )}
    </div>
  );
}
