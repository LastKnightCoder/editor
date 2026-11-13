import { contentAgentCommand } from "./content";
import type { AgentPresence, AgentPresenceUpdate } from "@/types/agent-presence";

/** Agent 在某篇正文上的在场（身份、光标、当前动作）；只在本机打开这篇正文的视图里显示 */
export const setAgentPresence = (contentId: number, update: AgentPresenceUpdate) =>
  contentAgentCommand<void>("content:agent-presence", contentId, update);

export const clearAgentPresence = (contentId: number, agent: string) =>
  contentAgentCommand<void>("content:agent-presence-clear", contentId, agent);

export const listAgentPresences = (contentId: number) =>
  contentAgentCommand<AgentPresence[]>("content:agent-presences", contentId);
