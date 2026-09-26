/**
 * pi 会话宿主（主进程）与渲染端共享的桥类型：
 * 工具桥（ToolRegistry ↔ pi customTools）与会话创建参数中跨进程的字段。
 */
import type { RequestMessage } from "@/types";
import type { PiThinkingLevel } from "./pi-llm";

/** 桌面工具清单项（渲染端 ToolRegistry 序列化）：JSON Schema 直通 pi */
export interface PiHostToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** 渲染端执行结果（toolRegistry ToolExecutionResult 的桥形状） */
export interface PiHostToolCallResult {
  content: string;
  /** 发给模型的文本（缺省用 content） */
  modelContent?: string;
  metadata?: Record<string, unknown>;
  isError?: boolean;
}

/** 主进程 pi-tool-call 事件载荷（工具桥：pi 调用 → 渲染端执行） */
export interface PiToolCallPayload {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
}

/** 会话创建参数（PiSessionCreateRequest 的渲染端形状） */
export interface PiSessionCreateRequestV2 {
  sessionId: string;
  scope: string;
  cwd: string;
  modelRef: { providerId: string; modelId: string };
  systemPrompt?: string;
  persist?: boolean;
  shellPath?: string;
  customTools?: PiHostToolSpec[];
  thinkingLevel?: PiThinkingLevel;
  /** 历史灌入（桌面 chat-core 消息；system/tool 消息由主进程转换器忽略） */
  initialMessages?: RequestMessage[];
  retryMaxRetries?: number;
}
