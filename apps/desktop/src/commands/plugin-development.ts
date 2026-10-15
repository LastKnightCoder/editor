import { invoke } from "@/electron";
import { withModule } from "./module-init";
import type { DevelopmentSession, RestoredDevelopmentPlugin } from "@/types/plugin-development";

export function chooseDevelopmentPlugin(token: string): Promise<RestoredDevelopmentPlugin | null> {
  return withModule("plugin-development", () => invoke("plugin-development:choose", token));
}

export function openDevelopmentPlugins(
  name: string,
  reserved: string[]
): Promise<DevelopmentSession> {
  return withModule("plugin-development", () => invoke("plugin-development:open", name, reserved));
}
export function closeDevelopmentPlugins(token: string): Promise<void> {
  return withModule("plugin-development", () => invoke("plugin-development:close", token));
}
export function saveDevelopmentPluginState(
  token: string,
  id: string,
  enabled: boolean,
  starting: boolean
): Promise<void> {
  return withModule("plugin-development", () =>
    invoke("plugin-development:state", token, id, enabled, starting)
  );
}
export function removeDevelopmentPlugin(token: string, id: string): Promise<void> {
  return withModule("plugin-development", () => invoke("plugin-development:remove", token, id));
}
export function retireDevelopmentWorkspace(name: string): Promise<void> {
  return withModule("plugin-development", () => invoke("plugin-development:retire", name));
}
