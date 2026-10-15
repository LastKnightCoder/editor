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
import { useSettingsStore } from "../../src/app/settingsStore";
import "../../src/features/plugins/pages/plugin-page.page";
import { openDevelopmentPlugins } from "../../src/commands/plugin-development";
import type { DevelopmentSession } from "../../src/types/plugin-development";

definePage({ key: "home", label: "插件管理验证", params: {}, component: PluginManagerView });
useSettingsStore.getState().setSection("plugins");

export function Harness({ session }: { session: DevelopmentSession }) {
  const { navigator, state } = usePage();
  const [runtime] = useState(
    () =>
      new DesktopPluginRuntime({
        workspaceId: session.workspaceId,
        navigator,
        storage: createBrowserStorage(localStorage),
        plugins: [],
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
      }),
      open: (id: string) => runtime.host.executeCommand(id + ":open"),
      back: () => navigator.back(),
      settings: (id: string) => useSettingsStore.getState().setSection(`plugin:${id}:`),
      list: () => useSettingsStore.getState().setSection("plugins"),
      stop: () => runtime.dispose(),
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
void openDevelopmentPlugins("c07-verification", []).then(session =>
  root.render(
    <QueryClientProvider client={new QueryClient()}>
      <PageProvider initialKey="home">
        <Harness session={session} />
      </PageProvider>
    </QueryClientProvider>
  )
);
