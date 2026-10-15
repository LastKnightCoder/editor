import { useEffect, useState, version as reactVersion } from "react";
import { version as reactDomVersion } from "react-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserStorage } from "@tau/plugins/host";
import { PageProvider, usePage } from "../../src/page/PageProvider";
import { PageHost } from "../../src/page/PageHost";
import { definePage } from "../../src/page/definePage";
import { DesktopPluginRuntime } from "../../src/app/plugins/runtime";
import { PluginRuntimeContext } from "../../src/app/plugins/context";
import { PluginManagerView } from "../../src/features/plugins/views/PluginManagerView";
import { useSettingsStore } from "../../src/app/settingsStore";
import "../../src/features/plugins/pages/plugin-page.page";
import { openDevelopmentPlugins } from "../../src/commands/plugin-development";
import type { DevelopmentSession } from "../../src/types/plugin-development";

definePage({ key: "home", label: "插件管理验证", params: {}, component: PluginManagerView });
useSettingsStore.getState().setSection("plugins");
const restartRequired = new Set<string>();
const reloadCounts = new Map<string, number>();

export function Harness({ session }: { session: DevelopmentSession }) {
  const { navigator, state } = usePage();
  const [runtime] = useState(
    () =>
      new DesktopPluginRuntime({
        workspaceId: session.workspaceId,
        navigator,
        storage: createBrowserStorage(localStorage),
        plugins: [],
        restartRequired,
        reloadCounts,
        openSettings: key => useSettingsStore.getState().setSection(key),
      })
  );
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const manager = runtime.attachDevelopment(session);
    void manager.restore().then(() => setReady(true));
  }, [runtime, session]);
  Object.assign(window, {
    pluginVerification: {
      snapshot: () => ({
        plugins: runtime.host.listPlugins(),
        commands: runtime.host.listCommands(),
        styles: document.querySelectorAll("style[data-tau-plugin]").length,
        ready,
        reloading: runtime.development?.busy("example.external-counter") ?? false,
        watching: runtime.development?.watching("example.external-counter") ?? false,
        mountId: runtime.getPage("example.external-counter", "counter")?.mountId,
        settingsCount: runtime.listSettings().length,
        workspaceId: session.workspaceId,
        versions: { react: reactVersion, reactDom: reactDomVersion },
        errors: Object.fromEntries(
          runtime.host
            .listPlugins()
            .map(plugin => [plugin.id, runtime.development?.error(plugin.id) ?? plugin.error])
        ),
        enabled: Object.fromEntries(
          runtime.host
            .listPlugins()
            .map(plugin => [plugin.id, runtime.development?.enabled(plugin.id)])
        ),
      }),
      open: (id: string) => runtime.host.executeCommand(id + ":open"),
      back: () => navigator.back(),
      settings: (id: string) => useSettingsStore.getState().setSection(`plugin:${id}:`),
      list: () => useSettingsStore.getState().setSection("plugins"),
      stop: () => runtime.dispose(),
      switchWorkspace: async (name: string) => {
        const context = runtime.getPage("example.external-counter", "counter")?.context;
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

const container = document.getElementById("root");
if (!container) throw new Error("验证容器缺失");
const root = createRoot(container);
async function mountWorkspace(name: string) {
  const session = await openDevelopmentPlugins(name, []);
  useSettingsStore.getState().setSection("plugins");
  root.render(
    <QueryClientProvider key={session.workspaceId} client={new QueryClient()}>
      <PageProvider initialKey="home">
        <Harness session={session} />
      </PageProvider>
    </QueryClientProvider>
  );
}
void mountWorkspace("c07-verification");
