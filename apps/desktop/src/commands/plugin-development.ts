import { invoke } from "@/electron";
import { withModule } from "./module-init";
import type {
  DevelopmentSession,
  RestoredDevelopmentPlugin,
  PreparedDevelopmentReload,
} from "@/types/plugin-development";

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

export function prepareDevelopmentReload(
  token: string,
  id: string
): Promise<PreparedDevelopmentReload | null> {
  return withModule("plugin-development", () =>
    invoke("plugin-development:prepare-reload", token, id)
  );
}
export function commitDevelopmentReload(
  token: string,
  ticket: string,
  target: "next" | "previous",
  enabled: boolean,
  starting: boolean
): Promise<void> {
  return withModule("plugin-development", () =>
    invoke("plugin-development:commit-reload", token, ticket, target, enabled, starting)
  );
}
export function discardDevelopmentReload(token: string, ticket: string): Promise<void> {
  return withModule("plugin-development", () =>
    invoke("plugin-development:discard-reload", token, ticket)
  );
}
