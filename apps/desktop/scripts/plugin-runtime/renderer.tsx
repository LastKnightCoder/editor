import { useEffect, useState, version as reactVersion } from "react";
import { version as reactDomVersion } from "react-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserStorage } from "@tau/plugins/host";
import { PageProvider, usePage } from "../../src/page/PageProvider";
import { PageHost } from "../../src/page/PageHost";
import { DesktopPluginRuntime, PLUGIN_DETAIL_KEY } from "../../src/app/plugins/runtime";
import { PluginRuntimeContext } from "../../src/app/plugins/context";
import { getPluginWorkspace } from "../../src/commands/plugin-local";
import "../../src/features/plugins/pages/plugins.page";
import "../../src/features/plugins/pages/plugin-detail.page";
import "../../src/features/plugins/pages/plugin-page.page";

const COUNTER = "example.external-counter";
const container = document.getElementById("root");
if (!container) throw new Error("验证容器缺失");
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
        openSettings: key =>
          navigator.push(PLUGIN_DETAIL_KEY, {
            pluginId: key.split(":")[1],
            tab: "settings",
            section: key,
          }),
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
    pluginVerification: {
      snapshot: () => ({
        ready,
        busy: local.busy(),
        workspaceId,
        directory: local.directory,
        plugins: runtime.host.listPlugins(),
        commands: runtime.host.listCommands(),
        styles: document.querySelectorAll("style[data-tau-plugin]").length,
        mountId: runtime.getPage(COUNTER, "counter")?.mountId,
        settingsCount: runtime.listSettings().length,
        versions: { react: reactVersion, reactDom: reactDomVersion },
        issues: local.issues.map(item => item.error),
        errors: Object.fromEntries(
          runtime.host.listPlugins().map(plugin => [plugin.id, local.error(plugin.id) ?? null])
        ),
        enabled: Object.fromEntries(
          runtime.host.listPlugins().map(plugin => [plugin.id, local.enabled(plugin.id)])
        ),
      }),
      open: (id: string) => runtime.host.executeCommand(id + ":open"),
      back: () => navigator.back(),
      list: () => navigator.push("plugins", { tab: "installed" }),
      detail: (id: string, tab?: string) =>
        navigator.push(PLUGIN_DETAIL_KEY, { pluginId: id, tab }),
      stop: () => runtime.dispose(),
      switchWorkspace: async (name: string) => {
        const context = runtime.getPage(COUNTER, "counter")?.context;
        await runtime.dispose();
        const result = {
          aborted: context?.signal.aborted,
          commands: runtime.host.listCommands().length,
          styles: document.querySelectorAll("style[data-tau-plugin]").length,
          lateWriteRejected: context
            ? await context.storage.set("late", 1).then(
                () => false,
                () => true
              )
            : undefined,
        };
        await mountWorkspace(name);
        return result;
      },
    },
  });
  return (
    <PluginRuntimeContext.Provider value={runtime}>
      <PageHost state={state} />
    </PluginRuntimeContext.Provider>
  );
}

async function mountWorkspace(name: string) {
  const workspaceId = await getPluginWorkspace(name);
  root.render(
    <QueryClientProvider key={workspaceId} client={new QueryClient()}>
      <PageProvider initialKey="plugins" initialParams={{ tab: "installed" }}>
        <Harness workspaceId={workspaceId} />
      </PageProvider>
    </QueryClientProvider>
  );
}
void mountWorkspace("runtime-verification");
