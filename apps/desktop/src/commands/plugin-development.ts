import { invoke } from "@/electron";
import { withModule } from "./module-init";
import type { DevelopmentPluginPackage } from "@tau/plugins/host";

export function chooseDevelopmentPlugin(): Promise<DevelopmentPluginPackage | null> {
  return withModule("plugin-development", () => invoke("plugin-development:choose"));
}
