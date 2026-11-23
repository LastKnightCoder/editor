import { invoke } from "@/electron";
import type { WorkspacePreferences } from "@/types/workspace-preferences";

export const getWorkspacePreferences = (): Promise<WorkspacePreferences> =>
  invoke("workspace-preferences:get");

export const saveWorkspacePreferences = (
  patch: Partial<WorkspacePreferences>
): Promise<WorkspacePreferences> => invoke("workspace-preferences:save", patch);
