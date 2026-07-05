import type { ChatAgentType } from "@/types";

export const CHAT_AGENT_TYPE_STORAGE_KEY = "chat-agent-type";
export const CHAT_AGENT_WORKING_DIRECTORY_STORAGE_KEY =
  "chat-agent-working-directory";

export const normalizeChatAgentType = (
  value: ChatAgentType | null | undefined,
): ChatAgentType => (value === "codex" ? "codex" : "local");
