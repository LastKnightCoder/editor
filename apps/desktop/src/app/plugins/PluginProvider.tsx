import { useEffect, useState, type ReactNode } from "react";
import { createBrowserStorage } from "@tau/plugins/host";
import { usePage } from "@/page/PageProvider";
import useSettingStore from "@/stores/useSettingStore";
import { DesktopPluginRuntime, PLUGIN_DETAIL_KEY } from "./runtime";
import { PluginRuntimeContext, PluginRuntimeErrorContext } from "./context";
import { desktopFetch } from "@/commands/fetch";
import { isElectron, on, off } from "@/electron";
import { getPluginWorkspace } from "@/commands/plugin-local";
import { migratePluginPreferences } from "./development-manager";
import { themePlugin } from "./builtin/themePlugin";
import { createDesktopExcerpts } from "./excerpts";
import { desktopPluginServices } from "./services";
import { useSettingsStore } from "@/app/settingsStore";

const restartRequired = new Set<string>();
const reloadCounts = new Map<string, number>();
let pendingCleanup: Promise<void> = Promise.resolve();

export function DesktopPluginProvider({ children }: { children: ReactNode }) {
  const { navigator } = usePage();
  const workspaceId = useSettingStore(state => state.setting.database.active);
  const [runtime, setRuntime] = useState<DesktopPluginRuntime | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let current: DesktopPluginRuntime | undefined;
    let cancelled = false;
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
      void current?.builtin?.restore(event.key);
    };
    const onLocalState = () => {
      void current?.local?.refresh().catch(() => undefined);
    };
    if (isElectron) on("plugin-local:state-changed", onLocalState);
    const previousCleanup = pendingCleanup;
    const preparation = (
      import.meta.env.DEV ? import("./editorComposition") : Promise.resolve(null)
    )
      .then(async modules => {
        await previousCleanup;
        if (cancelled) return;
        const plugins = [themePlugin];
        const composePluginEditor = modules?.composePluginEditor;
        const persistentWorkspaceId = isElectron
          ? await getPluginWorkspace(workspaceId)
          : workspaceId;
        if (cancelled) return;
        if (isElectron)
          migratePluginPreferences(window.localStorage, workspaceId, persistentWorkspaceId);
        current = new DesktopPluginRuntime({
          workspaceId: persistentWorkspaceId,
          navigator,
          storage: createBrowserStorage(window.localStorage),
          plugins,
          fetch: desktopFetch,
          services: desktopPluginServices,
          ...createDesktopExcerpts(workspaceId),
          restartRequired,
          reloadCounts,
          validateEditor: composePluginEditor,
          openSettings: (key, target) =>
            target === "sync"
              ? useSettingsStore.getState().openSettings("sync")
              : navigator.push(PLUGIN_DETAIL_KEY, {
                  pluginId: key.split(":")[1],
                  tab: "settings",
                  section: key,
                }),
        });
        const local = isElectron ? current.attachLocal(window.localStorage) : undefined;
        const builtin = current.attachBuiltins([themePlugin.id], window.localStorage);
        window.addEventListener("storage", onStorage);
        setRuntime(current);
        void builtin.restore();
        if (local) void local.refresh().catch(() => undefined);
      })
      .catch(error => {
        if (!cancelled) setError(error instanceof Error ? error.message : "插件初始化失败");
      });
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      if (isElectron) off("plugin-local:state-changed", onLocalState);
      pendingCleanup = Promise.allSettled([
        previousCleanup,
        current ? current.dispose() : preparation,
      ]).then(results => {
        for (const result of results) {
          if (result.status === "rejected") console.error("插件运行时清理失败", result.reason);
        }
      });
    };
  }, [workspaceId, navigator]);
  return (
    <PluginRuntimeContext.Provider value={runtime}>
      <PluginRuntimeErrorContext.Provider value={error}>
        {children}
      </PluginRuntimeErrorContext.Provider>
    </PluginRuntimeContext.Provider>
  );
}
