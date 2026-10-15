import { invoke, on, off } from "@/electron";
import { withModule } from "./module-init";
import type {
  DevelopmentSession,
  RestoredDevelopmentPlugin,
  PreparedDevelopmentReload,
  DevelopmentBuildEvent,
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
  id: string,
  buildId?: string
): Promise<PreparedDevelopmentReload | null> {
  return withModule("plugin-development", () =>
    invoke("plugin-development:prepare-reload", token, id, buildId)
  );
}

export function watchDevelopmentBuilds(
  token: string,
  id: string,
  watchId: string,
  enabled: boolean
): Promise<void> {
  return withModule("plugin-development", () =>
    invoke("plugin-development:watch", token, id, watchId, enabled)
  );
}
export function subscribeDevelopmentBuilds(listener: (event: DevelopmentBuildEvent) => void) {
  const receive = (_event: unknown, build: DevelopmentBuildEvent) => listener(build);
  on("plugin-development:build", receive);
  return () => off("plugin-development:build", receive);
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
