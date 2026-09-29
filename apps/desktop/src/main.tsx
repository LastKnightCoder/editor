// import { scan } from "react-scan";
// scan({
//   enabled: import.meta.env.DEV,
// });
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { QueryClientProvider } from "@tanstack/react-query";
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
import { initToolCallRenderers } from "@/tool-call-renderers";
import { useContentEditReviewSessionStore } from "@/services/content-editing";
import { queryClient } from "./queryClient";

dayjs.locale("zh-cn");
useBackendWebsocketStore.getState().initClient();
initializeTooling();
initToolCallRenderers();

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
