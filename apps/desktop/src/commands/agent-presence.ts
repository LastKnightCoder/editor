import { bindDatabaseCommands, currentCommandScope } from "@/services/command-context";
import { invoke } from "@/electron";
import { withModule } from "./module-init";
import type { AgentPresence, AgentPresenceUpdate } from "@/types/agent-presence";

const presenceCommand = <T>(channel: string, ...args: unknown[]) => {
  const commands = bindDatabaseCommands({ invoke }, currentCommandScope());
  return withModule("collaboration", () => commands.invoke<T>(channel, ...args));
};

/** Agent 在某篇正文上的在场（身份、光标、当前动作）；只在本机打开这篇正文的视图里显示 */
export const setAgentPresence = (contentId: number, update: AgentPresenceUpdate) =>
  presenceCommand<void>("content:agent-presence", contentId, update);

export const clearAgentPresence = (contentId: number, agent: string) =>
  presenceCommand<void>("content:agent-presence-clear", contentId, agent);

export const listAgentPresences = (contentId: number) =>
  presenceCommand<AgentPresence[]>("content:agent-presences", contentId);
