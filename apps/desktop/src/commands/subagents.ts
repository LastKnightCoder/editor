import { invoke, on, off } from "@/electron";
import { withModule } from "./module-init";
import type { SubagentSnapshot, SubagentDetail, SubagentParentRef } from "@/types/subagent";

export const listSubagents = (parent?: SubagentParentRef) =>
  withModule("pi-subagents", () =>
    invoke<SubagentSnapshot>("pi-subagents:list", parent ? { parent } : undefined)
  );
export const getSubagentDetail = (agentId: string, parent?: SubagentParentRef) =>
  withModule("pi-subagents", () =>
    invoke<SubagentDetail>("pi-subagents:detail", { agentId, parent })
  );
export const cancelSubagentRun = (agentId: string, runId: string) =>
  withModule("pi-subagents", () => invoke<void>("pi-subagents:cancel", { agentId, runId }));
export const onSubagentsChanged = (listener: () => void): (() => void) => {
  const handler = () => listener();
  on("pi-subagents:changed", handler);
  return () => off("pi-subagents:changed", handler);
};
