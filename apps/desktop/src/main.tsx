// import { scan } from "react-scan";
// scan({
//   enabled: import.meta.env.DEV,
// });
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReactDOM from "react-dom/client";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

import "./init";
// 命令契约桥装配须早于任何 command 调用（与 init 同步区执行）
import "./commands/contracts/install";
import "./tailwind.css";
import "./main.less";

import App from "@/App.tsx";
import { initializeTooling } from "@/tools";
import { initBlockRenderers } from "@/renderers";
import { initToolCallRenderers } from "@/tool-call-renderers";
import { initializeTabContentProviders } from "@/mcp/tab-content/providers";
import { useContentEditReviewSessionStore } from "@/services/content-editing";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

dayjs.locale("zh-cn");
useBackendWebsocketStore.getState().initClient();
initializeTooling();
initBlockRenderers();
initToolCallRenderers();
initializeTabContentProviders();

// 清理刷新前遗留的 pending 会话（这些会话的 resolver 已丢失）
useContentEditReviewSessionStore.getState().cleanupStalePendingSessions();

const bootstrap = async () => {
  await useDynamicExtensionsStore.getState().initExtensions();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
};

void bootstrap();
