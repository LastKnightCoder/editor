import { ipcMain } from "electron";
import PiSessionHostModule from "./pi-session-host";
import type { SubagentParentRef } from "@/types/subagent";

export default class PiSubagentsModule {
  static init(): void {
    const runtime = PiSessionHostModule.subagents();
    ipcMain.handle("pi-subagents:list", (event, payload?: { parent?: SubagentParentRef }) =>
      runtime.snapshot(event.sender, payload?.parent)
    );
    ipcMain.handle(
      "pi-subagents:detail",
      (event, { agentId, parent }: { agentId: string; parent?: SubagentParentRef }) =>
        runtime.detail(event.sender, agentId, parent)
    );
    ipcMain.handle(
      "pi-subagents:cancel",
      (event, { agentId, runId }: { agentId: string; runId: string }) =>
        runtime.cancel(event.sender, agentId, runId)
    );
  }
}
