import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserStorage } from "@tau/plugins/host";
import { PageProvider, usePage } from "../../src/page/PageProvider";
import { PageHost } from "../../src/page/PageHost";
import { DesktopPluginRuntime } from "../../src/app/plugins/runtime";
import { PluginRuntimeContext } from "../../src/app/plugins/context";
import { getPluginWorkspace } from "../../src/commands/plugin-local";
import { Sidebar } from "../../src/app/Sidebar";
import "../../src/features/plugins/pages/plugins.page";
import "../../src/features/plugins/pages/plugin-detail.page";
import "../../src/features/plugins/pages/plugin-page.page";

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
        openSettings: () => undefined,
      })
  );
  const [local] = useState(() => runtime.attachLocal(localStorage));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void local
      .refresh()
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, [local]);
  Object.assign(window, {
    localTest: {
      snapshot: () => ({
        ready,
        workspaceId,
        updates: local.updates,
        plugins: runtime.host.listPlugins(),
        commands: runtime.host.listCommands(),
        busy: local.busy(),
        issues: local.issues.map(item => item.error),
        directory: local.directory,
        styles: document.querySelectorAll('style[data-tau-plugin="lastknight.water-checkin"]')
          .length,
      }),
      run: () => runtime.host.executeCommand("example.local:run"),
      openAuthor: () => runtime.host.executeCommand("example.external-counter:open"),
      openWater: () => runtime.host.executeCommand("lastknight.water-checkin:open"),
      list: () => navigator.push("plugins", { tab: "installed" }),
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
      <Sidebar resizing={false} />
      <PageHost state={state} />
    </PluginRuntimeContext.Provider>
  );
}

async function mount(name: string) {
  const workspaceId = await getPluginWorkspace(name);
  root.render(
    <QueryClientProvider key={workspaceId} client={new QueryClient()}>
      <PageProvider initialKey="plugins" initialParams={{ tab: "installed" }}>
        <Harness workspaceId={workspaceId} />
      </PageProvider>
    </QueryClientProvider>
  );
}
const params = new URLSearchParams(location.search);
void mount(params.get("workspace") ?? "fixed-directory-test");
