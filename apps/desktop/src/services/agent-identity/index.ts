import type { CSSProperties } from "react";
import { memberColor } from "@tau/collaboration";

/** 未经子 Agent 派发、由主对话直接改正文时的署名。 */
export const MAIN_AGENT_NAME = "助手";
const MAX_NAME = 8;

export interface AgentIdentity {
  /** 颜色与在场身份的来源：同名的 Agent 在各篇文档、各窗口里颜色一致 */
  id: string;
  name: string;
  color: string;
}

/** 职责名由派发方 AI 在 spawn_agent 的 title 里给出；过长时截断，缺省为主对话署名。 */
export function agentIdentity(label?: string): AgentIdentity {
  const name = (label?.trim() || MAIN_AGENT_NAME).slice(0, MAX_NAME);
  const id = `agent:${name}`;
  return { id, name, color: memberColor(id) };
}

/** 把 Agent 身份色挂到 `--agent` 上，子元素用 `text-[var(--agent)]` 等任意值类取色 */
export const agentColorStyle = (name: string | undefined): CSSProperties =>
  ({ "--agent": agentIdentity(name).color }) as CSSProperties;
