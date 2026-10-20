import type { BackendStatus } from "@tau/plugins/backend";
import type { PluginBackendManifest } from "@tau/plugins/package";

export interface PluginBackendSnapshot {
  systemReviewed?: boolean;
  executionAvailable?: boolean;
  pluginId: string;
  version: string;
  digest: string;
  backend: PluginBackendManifest;
  enabled: boolean;
  authorized: boolean;
  status: BackendStatus;
}
