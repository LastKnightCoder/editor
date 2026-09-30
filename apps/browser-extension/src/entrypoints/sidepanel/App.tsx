import { useEffect, useRef } from "react";
import { ToastHost } from "@tau/ui";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useThemeStore } from "../../stores/useThemeStore";
import { useTheme } from "../../hooks/useTheme";
import { useSyncFont } from "../../hooks/useSyncFont";
import { initExtToolServer } from "../../services/extToolServer";
import { initChatStoreService } from "../../services/chatStoreClient";
import MainLayout from "./components/MainLayout";
import WelcomePage from "./components/WelcomePage";

export default function App() {
  const { status, client, reconnect } = useWebSocket();
  const { themeMode, setThemeMode, loaded } = useThemeStore();
  const resolvedTheme = useTheme(themeMode);
  const isDark = resolvedTheme === "dark";

  // 同步客户端字体设置到 CSS 变量，对齐 desktop useSyncFont
  useSyncFont(client, status === "connected");

  // 将 dark 类设置到 html 根元素，确保 Tailwind dark: 和 CSS 变量同时生效
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    // 公共包按 @tau/themes 约定读 data-mode 判明暗
    root.dataset.mode = isDark ? "dark" : "light";
  }, [isDark]);

  // 初始化浏览器工具服务端（用于处理桌面端的工具调用请求）
  useEffect(() => {
    initExtToolServer();
  }, []);

  // 对话存在桌面端（按页面的 pi 会话文件）：建立 chat.* 通道，断线自动重连
  useEffect(() => {
    initChatStoreService();
  }, []);

  console.log("isDark", isDark);
  console.log("themeMode", themeMode);
  console.log("resolvedTheme", resolvedTheme);


  // 追踪是否曾经成功连接过，用于区分首次连接与重连
  const wasEverConnectedRef = useRef(false);
  if (status === "connected") wasEverConnectedRef.current = true;

  const showMainLayout =
    status === "connected" || (status === "connecting" && wasEverConnectedRef.current);
  const showWelcome = status === "disconnected";
  const showLoading = status === "connecting" && !wasEverConnectedRef.current;

  if (!loaded) return null;

  return (
    <div
      style={{
        height: "100%",
        fontSize: "var(--font-size)",
        color: "var(--text-normal)",
      }}
    >
      <ToastHost />
      <DndProvider backend={HTML5Backend}>
          <div className="h-screen w-screen bg-gray-100 dark:bg-[#010409]">
            {showMainLayout ? (
              <MainLayout
                wsClient={client}
                reconnect={reconnect}
                themeMode={themeMode}
                resolvedTheme={resolvedTheme}
                onThemeModeChange={setThemeMode}
              />
            ) : showLoading ? (
              <div className="flex h-full flex-col items-center justify-center">
                <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                <p className="text-sm text-gray-400 dark:text-[#484f58]">正在连接...</p>
              </div>
            ) : (
              <WelcomePage status={status} onRetry={reconnect} />
            )}
          </div>
        </DndProvider>
    </div>
  );
}
