import ReactDOM from "react-dom/client";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

import "./init";
// 命令契约桥装配须早于异步加载的应用模块。
import "./commands/contracts/install";
import "./tailwind.css";
import "./app/base.css";

dayjs.locale("zh-cn");

const root = ReactDOM.createRoot(document.getElementById("root")!);

// 先挂载轻量启动界面，避免后台模块和编辑器扩展加载期间出现白屏。
root.render(
  <div className="bg-page text-tau-caption text-ink-2 grid h-screen place-items-center">
    正在启动…
  </div>
);

void bootstrap().catch(error => {
  console.error("应用启动失败", error);
  root.render(
    <div className="bg-page text-tau-caption text-danger grid h-screen place-items-center p-6">
      应用启动失败，请重启后重试。
    </div>
  );
});

async function bootstrap() {
  // 应用模块全部改为首帧之后加载，保留原有初始化顺序与依赖关系。
  const [
    { useBackendWebsocketStore },
    { default: useDynamicExtensionsStore },
    { QueryClientProvider },
    { default: App },
    { initializeTooling },
    { initToolCallRenderers },
    { useContentEditReviewSessionStore },
    { queryClient },
    { initializeContentPlugins },
    { DesktopPluginServicesProvider },
  ] = await Promise.all([
    import("@/stores/useBackendWebsocketStore"),
    import("@/stores/useDynamicExtensionsStore"),
    import("@tanstack/react-query"),
    import("@/App.tsx"),
    import("@/tools"),
    import("@/tool-call-renderers"),
    import("@/services/content-editing"),
    import("./queryClient"),
    import("./app/plugins/content-plugin-bootstrap"),
    import("./app/plugins/ServiceProvider"),
  ]);

  useBackendWebsocketStore.getState().initClient();
  initializeTooling();
  initToolCallRenderers();
  useContentEditReviewSessionStore.getState().cleanupStalePendingSessions();

  await useDynamicExtensionsStore.getState().initExtensions();
  await initializeContentPlugins();

  root.render(
    <QueryClientProvider client={queryClient}>
      <DesktopPluginServicesProvider>
        <App />
      </DesktopPluginServicesProvider>
    </QueryClientProvider>
  );
}
