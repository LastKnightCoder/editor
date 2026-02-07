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

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-white dark:bg-[#161b22]">
      {/* 主页面层 */}
      <div
        className={`flex h-full flex-col transition-transform duration-300 ease-in-out ${
          currentPage === "settings" && !pageAnimating
            ? "-translate-x-1/4 opacity-0"
            : currentPage === "settings" && pageDirection === "in"
              ? "-translate-x-1/4 opacity-0"
              : "translate-x-0 opacity-100"
        }`}
        style={{
          display:
            currentPage === "settings" && !pageAnimating ? "none" : "flex",
        }}
      >
        <Header
          onSettingsClick={() => navigateTo("settings")}
          onReloadClick={reconnect}
        />
        <div className="flex min-h-0 flex-1 flex-col">{renderTabContent()}</div>
        <TabBar currentTab={currentTab} onTabChange={setCurrentTab} />
      </div>

      {/* 设置页面层 */}
      {currentPage === "settings" && (
        <div
          className={`absolute inset-0 flex flex-col bg-white dark:bg-[#161b22] ${
            pageDirection === "in"
              ? "animate-slide-in-right"
              : "animate-slide-out-right"
          }`}
          onAnimationEnd={handleAnimationEnd}
        >
          <SettingsPage
            themeMode={themeMode}
            onThemeModeChange={onThemeModeChange}
            onBack={navigateBack}
          />
        </div>
      )}
    </div>
  );
}
