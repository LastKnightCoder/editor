import { useEffect, useRef } from "react";
import { Spinner, ToastHost } from "@tau/ui";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useAiServerWebSocket } from "../../hooks/useAiServerWebSocket";
import { useSyncFont } from "../../hooks/useSyncFont";
import { useDesktopThemeSync } from "../../stores/useExtensionTheme";
import { initExtToolServer } from "../../services/extToolServer";
import { initChatStoreService } from "../../services/chatStoreClient";
import MainLayout from "./components/MainLayout";
import WelcomePage from "./components/WelcomePage";

export default function App() {
  const { status, client, reconnect } = useWebSocket();
  const { client: aiClient, status: aiStatus } = useAiServerWebSocket();

  // 同步客户端字体设置到 CSS 变量，对齐 desktop useSyncFont
  useSyncFont(client, status === "connected");
  // 主题族跟随桌面（深浅由扩展自己的偏好决定）
  useDesktopThemeSync(aiClient, aiStatus === "connected");

  // 初始化浏览器工具服务端（用于处理桌面端的工具调用请求）
  useEffect(() => {
    initExtToolServer();
  }, []);

  // 对话存在桌面端（按页面的 pi 会话文件）：建立 chat.* 通道，断线自动重连
  useEffect(() => {
    initChatStoreService();
  }, []);

  // 追踪是否曾经成功连接过，用于区分首次连接与重连
  const wasEverConnectedRef = useRef(false);
  if (status === "connected") wasEverConnectedRef.current = true;

  const showMainLayout =
    status === "connected" || (status === "connecting" && wasEverConnectedRef.current);
  const showLoading = status === "connecting" && !wasEverConnectedRef.current;

  return (
    <div className="bg-page text-ink-1 h-screen w-screen" style={{ fontSize: "var(--font-size)" }}>
      <ToastHost />
      <DndProvider backend={HTML5Backend}>
        {showMainLayout ? (
          <MainLayout
            wsClient={client}
            aiClient={aiClient}
            connecting={status !== "connected"}
            reconnect={reconnect}
          />
        ) : showLoading ? (
          <div className="text-tau-sm text-ink-3 flex h-full flex-col items-center justify-center gap-3">
            <Spinner />
            正在连接…
          </div>
        ) : (
          <WelcomePage status={status} onRetry={reconnect} />
        )}
      </DndProvider>
    </div>
  );
}
