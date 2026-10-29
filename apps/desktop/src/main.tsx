import ReactDOM from "react-dom/client";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

import "./init";
// 命令契约桥装配须早于异步加载的应用模块。
import "./commands/contracts/install";
import "./tailwind.css";
import "./app/base.css";
import { recordPerfStage } from "./utils/perf-observer";

dayjs.locale("zh-cn");

const root = ReactDOM.createRoot(document.getElementById("root")!);

// 先挂载轻量启动界面，避免后台模块和编辑器扩展加载期间出现白屏。
root.render(<StartupSplash label="正在启动…" />);

void bootstrap().catch(error => {
  console.error("应用启动失败", error);
  root.render(<StartupSplash label="应用启动失败，请重启后重试。" error />);
});

async function bootstrap() {
  const startedAt = performance.now();
  renderStartup("正在加载应用模块…");
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

  recordPerfStage("startup:dynamic-imports", startedAt);
  useBackendWebsocketStore.getState().initClient();
  initializeTooling();
  initToolCallRenderers();
  useContentEditReviewSessionStore.getState().cleanupStalePendingSessions();

  renderStartup("正在装配编辑器扩展…");
  const extensionsStartedAt = performance.now();
  await useDynamicExtensionsStore.getState().initExtensions();
  recordPerfStage("startup:editor-extensions", extensionsStartedAt);
  renderStartup("正在扫描并装配已启用的内容插件…");
  const pluginsStartedAt = performance.now();
  await initializeContentPlugins();
  recordPerfStage("startup:content-plugins", pluginsStartedAt);

  root.render(
    <QueryClientProvider client={queryClient}>
      <DesktopPluginServicesProvider>
        <App />
      </DesktopPluginServicesProvider>
    </QueryClientProvider>
  );
  recordPerfStage("startup:renderer-ready", startedAt);
}

function renderStartup(label: string) {
  root.render(<StartupSplash label={label} />);
}

function StartupSplash({ label, error = false }: { label: string; error?: boolean }) {
  return (
    <div
      className={`bg-page text-tau-caption grid h-screen place-items-center p-6 ${error ? "text-danger" : "text-ink-2"}`}
    >
      {label}
    </div>
  );
}
