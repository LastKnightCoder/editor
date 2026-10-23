import { createContext, useContext, useSyncExternalStore } from "react";
import type { MobilePluginRuntime } from "./runtime";

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
