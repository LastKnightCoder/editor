import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserStorage } from "@tau/plugins/host";
import { PageProvider, usePage } from "../../src/page/PageProvider";
import { PageHost } from "../../src/page/PageHost";
import { definePage } from "../../src/page/definePage";
import { DesktopPluginRuntime } from "../../src/app/plugins/runtime";
import { PluginRuntimeContext } from "../../src/app/plugins/context";
import { PluginManagerView } from "../../src/features/plugins/views/PluginManagerView";
import { getPluginWorkspace } from "../../src/commands/plugin-local";
import { useSettingsStore } from "../../src/app/settingsStore";
import "../../src/features/plugins/pages/plugin-page.page";

definePage({ key: "home", label: "插件管理", params: {}, component: PluginManagerView });
const container = document.getElementById("root");
if (!container) throw new Error("缺少验证容器");
const root = createRoot(container);

export function Harness({ workspaceId }: { workspaceId: string }) {
  const { navigator, state } = usePage();
  const [runtime] = useState(
    () =>
      new DesktopPluginRuntime({
        workspaceId,
        navigator,
        storage: createBrowserStorage(localStorage),
        plugins: [],
      })
  );
  const [local] = useState(() => runtime.attachLocal(localStorage));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void local.refresh().then(() => setReady(true));
  }, [local]);
  Object.assign(window, {
    localTest: {
      snapshot: () => ({
        ready,
        workspaceId,
        plugins: runtime.host.listPlugins(),
        commands: runtime.host.listCommands(),
        busy: local.busy(),
        issues: local.issues.map(item => item.error),
        directory: local.directory,
        styles: document.querySelectorAll('style[data-tau-plugin="lastknight.water-checkin"]')
          .length,
      }),
      openWater: () => runtime.host.executeCommand("lastknight.water-checkin:open"),
      list: () => {
        useSettingsStore.getState().setSection("plugins");
        navigator.push("home");
      },
      switchWorkspace: async (name: string) => {
        await runtime.dispose();
        await mount(name);
      },
      stop: async () => {
        await runtime.dispose();
        root.unmount();
      },
    },
  });
  return (
    <PluginRuntimeContext.Provider value={runtime}>
      <PageHost state={state} />
    </PluginRuntimeContext.Provider>
  );
}

async function mount(name: string) {
  const workspaceId = await getPluginWorkspace(name);
  useSettingsStore.getState().setSection("plugins");
  root.render(
    <QueryClientProvider key={workspaceId} client={new QueryClient()}>
      <PageProvider initialKey="home">
        <Harness workspaceId={workspaceId} />
      </PageProvider>
    </QueryClientProvider>
  );
}
void mount("water-author-a");
