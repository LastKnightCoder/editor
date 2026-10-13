import { useEffect, useState, type ReactNode } from "react";
import { createBrowserStorage } from "@tau/plugins/host";
import { usePage } from "@/page/PageProvider";
import useSettingStore from "@/stores/useSettingStore";
import { DesktopPluginRuntime } from "./runtime";
import { PluginRuntimeContext, PluginRuntimeErrorContext } from "./context";

export function DesktopPluginProvider({ children }: { children: ReactNode }) {
  const { navigator } = usePage();
  const workspaceId = useSettingStore(state => state.setting.database.active);
  const [runtime, setRuntime] = useState<DesktopPluginRuntime | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let current: DesktopPluginRuntime | undefined;
    let cancelled = false;
    void Promise.all([
      import("@/features/plugins/example/notesPlugin"),
      import("@/features/plugins/example/editorPlugin"),
      import("./editorComposition"),
    ])
      .then(([{ notesPlugin }, { editorPlugin }, { composePluginEditor }]) => {
        if (cancelled) return;
        current = new DesktopPluginRuntime({
          workspaceId,
          navigator,
          storage: createBrowserStorage(window.localStorage),
          plugins: [notesPlugin, editorPlugin],
          validateEditor: composePluginEditor,
        });
        setRuntime(current);
      })
      .catch(error => {
        if (!cancelled) setError(error instanceof Error ? error.message : "插件开发台初始化失败");
      });
    return () => {
      cancelled = true;
      if (current)
        void current.dispose().catch(error => console.error("插件运行时清理失败", error));
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
