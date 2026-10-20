import type {
  PluginAIFeature,
  PluginAIRequest,
  PluginAIResult,
  PluginAICapability,
} from "@tau/plugins";

export interface PluginAIConfig {
  enabled: boolean;
  dailyRequests: number;
  dailyTokens: number;
  concurrency: number;
  assignments: Record<string, { providerId: string; modelId: string } | null>;
}
export interface PluginAIInfo {
  id: string;
  name: string;
  features: PluginAIFeature[];
  hostFeatures?: PluginAICapability[];
  config: PluginAIConfig;
}
export interface PluginAIRunning {
  requestId: string;
  pluginId: string;
  pluginName: string;
  featureName: string;
  startedAt: number;
  hostFeature?: PluginAICapability;
}
export type PluginAIWireRequest = Omit<PluginAIRequest, "signal">;
export type PluginAIOutcome = { ok: true; result: PluginAIResult } | { ok: false; error: string };
