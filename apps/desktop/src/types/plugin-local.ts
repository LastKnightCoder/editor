import type { DevelopmentPluginPackage } from "@tau/plugins/host";

export interface LocalPluginEntry {
  id: string;
  directory: string;
  artifact?: DevelopmentPluginPackage;
  error?: string;
}

export interface LocalPluginScan {
  directory: string;
  entries: LocalPluginEntry[];
}
