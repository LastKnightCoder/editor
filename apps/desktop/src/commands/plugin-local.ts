import { invoke } from "@/electron";
import { withModule } from "./module-init";
import type { LocalPluginScan } from "@/types/plugin-local";

export const getPluginWorkspace = (name: string): Promise<string> =>
  withModule("plugin-local", () => invoke("plugin-local:workspace", name));
export const scanLocalPlugins = (): Promise<LocalPluginScan> =>
  withModule("plugin-local", () => invoke("plugin-local:scan"));
export const openPluginDirectory = (): Promise<void> =>
  withModule("plugin-local", () => invoke("plugin-local:open-directory"));
