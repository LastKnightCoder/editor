import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserStorage } from "@tau/plugins/host";
import { PageProvider, usePage } from "../../src/page/PageProvider";
import { PageHost } from "../../src/page/PageHost";
import { DesktopPluginRuntime } from "../../src/app/plugins/runtime";
import { PluginRuntimeContext } from "../../src/app/plugins/context";
import { getPluginWorkspace } from "../../src/commands/plugin-local";
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
      }),
      run: () => runtime.host.executeCommand("example.local:run"),
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
  root.render(
    <QueryClientProvider key={workspaceId} client={new QueryClient()}>
      <PageProvider initialKey="plugins" initialParams={{ tab: "installed" }}>
        <Harness workspaceId={workspaceId} />
      </PageProvider>
    </QueryClientProvider>
  );
}
void mount("fixed-directory-test");
