import { createContext, useContext, useSyncExternalStore } from "react";
import type { MobilePluginRuntime } from "./runtime";
import { mobilePluginState } from "./content";

export const MobilePluginsContext = createContext<MobilePluginRuntime | null>(null);
const subscribeEmpty = () => () => undefined;
const emptySnapshot = () => 0;
export function useMobilePlugins() {
  const runtime = useContext(MobilePluginsContext);
  useSyncExternalStore(
    runtime?.subscribe ?? subscribeEmpty,
    runtime?.getSnapshot ?? emptySnapshot,
    emptySnapshot
  );
  return runtime;
}

/** 重建插件会话：应用待生效包并重启全部插件，不重启应用。 */
export const MobilePluginReloadContext = createContext<() => void>(() => undefined);

export function useMobilePluginStatus() {
  const value = useSyncExternalStore(
    mobilePluginState.subscribe,
    mobilePluginState.get,
    mobilePluginState.get
  );
  return { ...value, reload: useContext(MobilePluginReloadContext) };
}
