import { invoke, send } from "@/electron";

export const CODEX_MCP_RESPONSE_CHANNEL = "codex-mcp-bridge:response";

export interface CodexAgentStreamRequest {
  input: string | unknown[];
  runId?: string;
  sessionKey?: string;
  agentSessionId?: string | null;
  workingDirectory?: string | null;
  mcpTools: unknown[];
}

export async function getCodexAvailability<T>(): Promise<T> {
  return invoke("codex-agent:getAvailability");
}

export async function cancelCodexStream(payload: {
  requestId: number | string | undefined;
  runId?: string;
}): Promise<void> {
  return invoke("codex-agent:cancel", payload);
}

export async function startCodexStream<T>(request: CodexAgentStreamRequest): Promise<T> {
  return invoke("codex-agent:stream", request);
}

/** 回推 MCP 工具执行结果给主进程（fire-and-forget） */
export function sendCodexMcpResponse(payload: unknown): void {
  send(CODEX_MCP_RESPONSE_CHANNEL, payload);
}
