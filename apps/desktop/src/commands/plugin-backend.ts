import { invoke } from "@/electron";
import { withModule } from "./module-init";
import type { PluginBackendSnapshot } from "@/types/plugin-backend";

export const backendRequest = <T>(method: string, ...args: unknown[]) =>
  withModule("plugin-backend", () => invoke<T>(`plugin-backend:${method}`, ...args));
export const getPluginBackend = (id: string) =>
  backendRequest<PluginBackendSnapshot>("snapshot", id);
export const grantPluginBackend = (
  id: string,
  digest: string,
  decision: "once" | "always" | null
) => backendRequest<void>("grant", id, digest, decision);
export const restartPluginBackend = (id: string) => backendRequest<void>("restart", id);
