import { createContext, useContext, useSyncExternalStore } from "react";
import type { DesktopPluginRuntime } from "./runtime";

export const PluginRuntimeContext = createContext<DesktopPluginRuntime | null>(null);
export const PluginRuntimeErrorContext = createContext("");
const noSubscribe = () => () => undefined;
const noRevision = () => 0;

export const useDesktopPluginError = () => useContext(PluginRuntimeErrorContext);

export function useDesktopPlugins() {
  const runtime = useContext(PluginRuntimeContext);
  useSyncExternalStore(runtime?.subscribe ?? noSubscribe, runtime?.getRevision ?? noRevision);
  return runtime;
}
