import { invoke } from "@/electron";
import { withModule } from "./module-init";
import type { PluginAIConfig, PluginAIInfo, PluginAIRunning } from "@/types/plugin-ai";

export const invokePluginAI = <T>(channel: string, ...args: unknown[]) =>
  withModule("plugin-ai", () => invoke<T>(`plugin-ai:${channel}`, ...args));
export const getPluginAIInfo = (id: string) => invokePluginAI<PluginAIInfo | null>("info", id);
export const configurePluginAI = (id: string, config: PluginAIConfig) =>
  invokePluginAI<void>("configure", { id, config });
export const revokePluginAI = (id: string) => invokePluginAI<void>("revoke", id);
export const runningPluginAI = () => invokePluginAI<PluginAIRunning[]>("running");
export const cancelPluginAI = (requestId: string) => invokePluginAI<void>("cancel", requestId);
export const pluginAIModels = () =>
  invokePluginAI<{ providerId: string; modelId: string; label: string }[]>("models");
