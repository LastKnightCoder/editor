import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PluginServicesProvider } from "@tau/plugins/services-host";
import useSettingStore from "@/stores/useSettingStore";
import { contentPluginLoaded } from "./content-plugin-state";
import { desktopPluginServices } from "./services";
import { PluginServiceScope } from "./service-scope";

export function DesktopPluginServicesProvider({
  children,
  workspace: pinnedWorkspace,
}: {
  children: ReactNode;
  workspace?: string;
}) {
  const activeWorkspace = useSettingStore(state => state.setting.database.active);
  const workspace = pinnedWorkspace ?? activeWorkspace;
  const currentWorkspace = useRef(workspace);
  currentWorkspace.current = workspace;
  const [scope, setScope] = useState<PluginServiceScope>();
  useLayoutEffect(() => {
    const current = new PluginServiceScope(
      desktopPluginServices,
      pluginId =>
        contentPluginLoaded(pluginId) &&
        currentWorkspace.current === workspace &&
        (pinnedWorkspace !== undefined ||
          useSettingStore.getState().setting.database.active === workspace)
    );
    setScope(current);
    const dispose = () => current.dispose();
    window.addEventListener("pagehide", dispose);
    return () => {
      window.removeEventListener("pagehide", dispose);
      dispose();
    };
  }, [workspace, pinnedWorkspace]);
  const resolve = useCallback((pluginId: string) => scope?.resolve(pluginId), [scope]);
  return <PluginServicesProvider resolve={resolve}>{children}</PluginServicesProvider>;
}
