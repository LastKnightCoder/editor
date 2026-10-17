import { createRoot } from "react-dom/client";
import { createBrowserStorage } from "@tau/plugins/host";
import { DesktopPluginRuntime } from "../../src/app/plugins/runtime";
import { PluginRuntimeContext } from "../../src/app/plugins/context";
import { PluginManagerView } from "../../src/features/plugins/views/PluginManagerView";
import { getPluginWorkspace } from "../../src/commands/plugin-local";
import { useSettingsStore } from "../../src/app/settingsStore";
import { themePlugin } from "../../src/app/plugins/builtin/themePlugin";

async function start() {
  const workspaceId = await getPluginWorkspace("fixed-directory-test");
  const runtime = new DesktopPluginRuntime({
    workspaceId,
    storage: createBrowserStorage(localStorage),
    navigator: { push: () => undefined },
    plugins: [themePlugin],
    openSettings: () => undefined,
  });
  const local = runtime.attachLocal(localStorage);
  useSettingsStore.getState().setSection("plugins");
  const container = document.getElementById("root");
  if (!container) throw new Error("缺少验证容器");
  const root = createRoot(container);
  root.render(
    <PluginRuntimeContext.Provider value={runtime}>
      <PluginManagerView />
    </PluginRuntimeContext.Provider>
  );
  Object.assign(window, {
    localTest: {
      snapshot: () => ({
        plugins: runtime.host.listPlugins(),
        commands: runtime.host.listCommands(),
        busy: local.busy(),
        issues: local.issues.map(item => item.error),
        directory: local.directory,
        workspaceId,
        updates: local.updates,
      }),
      run: () => runtime.host.executeCommand("example.local:run"),
      openAuthor: async () => {
        await runtime.host.executeCommand("example.external-counter:open");
        const page = runtime.getPage("example.external-counter", "counter");
        if (!page) throw new Error("作者页面未注册");
        const Component = page.definition.component;
        root.render(<Component context={page.context} params={{}} />);
      },
      stop: async () => {
        await runtime.dispose();
        root.unmount();
      },
    },
  });
  await local.refresh();
}
void start();
