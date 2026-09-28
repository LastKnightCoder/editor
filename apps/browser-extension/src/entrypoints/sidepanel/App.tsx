import { useEffect, useMemo, useRef } from "react";
import { App as AntdApp, ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
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

  // antd 主题配置，与 desktop App.tsx 对齐
  const antdThemeConfig = useMemo(
    () => ({
      algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        colorPrimary: "#3b82f6",
        colorLink: "#3b82f6",
        colorBorder: isDark ? "#2a2a2a" : "#e5e5e5",
        colorBorderSecondary: isDark ? "#1f1f1f" : "#f0f0f0",
        colorText: isDark ? "#e5e5e5" : "#262626",
        colorTextSecondary: isDark ? "#a3a3a3" : "#737373",
        colorTextTertiary: isDark ? "#737373" : "#a3a3a3",
        colorBgContainer: isDark ? "#141414" : "#ffffff",
        colorBgElevated: isDark ? "#1f1f1f" : "#ffffff",
        borderRadius: 8,
        borderRadiusLG: 12,
        borderRadiusSM: 6,
      },
      components: {
        Dropdown: {
          colorBgElevated: isDark ? "rgba(10, 15, 28, 0.85)" : "rgba(248, 250, 255, 0.92)",
          colorBorder: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.45)",
          colorSplit: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.45)",
          colorText: isDark ? "rgba(241, 245, 249, 0.95)" : "rgba(15, 23, 42, 0.95)",
          colorTextDescription: isDark ? "rgba(148, 163, 184, 0.7)" : "rgba(100, 116, 139, 0.7)",
          boxShadowSecondary: isDark
            ? "0 22px 60px rgba(2, 6, 23, 0.7)"
            : "0 18px 45px rgba(15, 23, 42, 0.25)",
          controlItemBgHover: isDark ? "rgba(148, 163, 184, 0.15)" : "rgba(255, 255, 255, 0.6)",
          controlItemBgActive: isDark ? "rgba(148, 163, 184, 0.15)" : "rgba(255, 255, 255, 0.6)",
          controlItemBgActiveHover: isDark
            ? "rgba(148, 163, 184, 0.15)"
            : "rgba(255, 255, 255, 0.6)",
        },
        Popover: {
          colorBgElevated: isDark ? "rgba(10, 15, 28, 0.85)" : "rgba(248, 250, 255, 0.92)",
          colorText: isDark ? "rgba(241, 245, 249, 0.95)" : "rgba(15, 23, 42, 0.95)",
          colorTextDescription: isDark ? "rgba(148, 163, 184, 0.7)" : "rgba(100, 116, 139, 0.7)",
          colorTextHeading: isDark ? "rgba(241, 245, 249, 0.95)" : "rgba(15, 23, 42, 0.95)",
          colorSplit: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.45)",
          boxShadowSecondary: isDark
            ? "0 22px 60px rgba(2, 6, 23, 0.7)"
            : "0 18px 45px rgba(15, 23, 42, 0.25)",
        },
        Tooltip: {
          colorBgSpotlight: isDark ? "#1f1f1f" : "#ffffff",
          colorTextLightSolid: isDark ? "#e5e5e5" : "#262626",
        },
      },
    }),
    [isDark]
  );

  // 追踪是否曾经成功连接过，用于区分首次连接与重连
  const wasEverConnectedRef = useRef(false);
  if (status === "connected") wasEverConnectedRef.current = true;

  const showMainLayout =
    status === "connected" || (status === "connecting" && wasEverConnectedRef.current);
  const showWelcome = status === "disconnected";
  const showLoading = status === "connecting" && !wasEverConnectedRef.current;

  if (!loaded) return null;

  return (
    <ConfigProvider theme={antdThemeConfig} locale={zhCN}>
      <AntdApp
        style={{
          height: "100%",
          fontSize: "var(--font-size)",
          color: "var(--text-normal)",
        }}
      >
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
      </AntdApp>
    </ConfigProvider>
  );
}
