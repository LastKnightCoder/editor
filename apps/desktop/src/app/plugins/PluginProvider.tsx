import { useEffect, useState, type ReactNode } from "react";
import { createBrowserStorage } from "@tau/plugins/host";
import { usePage } from "@/page/PageProvider";
import useSettingStore from "@/stores/useSettingStore";
import { DesktopPluginRuntime } from "./runtime";
import { PluginRuntimeContext, PluginRuntimeErrorContext } from "./context";
import { useSettingsStore } from "../settingsStore";
import { desktopFetch } from "@/commands/fetch";
import { isElectron } from "@/electron";
import { openDevelopmentPlugins, closeDevelopmentPlugins } from "@/commands/plugin-development";
import { migratePluginPreferences } from "./development-manager";
import type { DevelopmentSession } from "@/types/plugin-development";

const restartRequired = new Set<string>();
const reloadCounts = new Map<string, number>();
let pendingCleanup: Promise<void> = Promise.resolve();

export function DesktopPluginProvider({ children }: { children: ReactNode }) {
  const { navigator } = usePage();
  const workspaceId = useSettingStore(state => state.setting.database.active);
  const [runtime, setRuntime] = useState<DesktopPluginRuntime | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let current: DesktopPluginRuntime | undefined;
    let cancelled = false;
    const previousCleanup = pendingCleanup;
    const preparation = Promise.all([
      import("@/features/plugins/example/notesPlugin"),
      import("@/features/plugins/example/editorPlugin"),
      import("./editorComposition"),
      import("@/features/plugins/example/settingsPlugin"),
      import("@/features/plugins/weread/plugin"),
    ])
      .then(
        async ([
          { notesPlugin },
          { editorPlugin },
          { composePluginEditor },
          { settingsPlugin },
          { createWeReadPlugin },
        ]) => {
          await previousCleanup;
          if (cancelled) return;
          const plugins = [
            notesPlugin,
            editorPlugin,
            settingsPlugin,
            createWeReadPlugin(() =>
              useSettingStore.getState().setting.integration.weread.apiKey.trim()
            ),
          ];
          let session: DevelopmentSession | undefined;
          if (isElectron) {
            session = await openDevelopmentPlugins(
              workspaceId,
              plugins.map(plugin => plugin.id)
            );
            if (cancelled) {
              await closeDevelopmentPlugins(session.token);
              return;
            }
            try {
              migratePluginPreferences(window.localStorage, workspaceId, session.workspaceId);
            } catch (error) {
              await closeDevelopmentPlugins(session.token);
              throw error;
            }
          }
          current = new DesktopPluginRuntime({
            workspaceId: session?.workspaceId ?? workspaceId,
            navigator,
            storage: createBrowserStorage(window.localStorage),
            plugins,
            fetch: desktopFetch,
            restartRequired,
            reloadCounts,
            validateEditor: composePluginEditor,
            openSettings: key => useSettingsStore.getState().openSettings(key),
          });
          const development = session ? current.attachDevelopment(session) : undefined;
          setRuntime(current);
          if (development) void development.restore();
        }
      )
      .catch(error => {
        if (!cancelled) setError(error instanceof Error ? error.message : "插件开发台初始化失败");
      });
    return () => {
      cancelled = true;
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
