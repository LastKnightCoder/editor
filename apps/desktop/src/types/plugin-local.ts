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
  updates?: LocalPluginUpdate[];
  clientVersion?: string;
}

export interface LocalPluginUpdate {
  id: string;
  pending?: boolean;
  pendingVersion?: string;
  previousVersion?: string;
  error?: string;
  blocked?: boolean;
}
