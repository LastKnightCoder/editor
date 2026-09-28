/**
 * PiSessionHost 桥层（主进程）：
 * 1. 桌面 chat-core 消息 → pi AgentMessage 转换器（历史灌入；
 *    assistant_blocks 按 turn 还原 assistant/toolResult 对，thinking 块因签名缺失不回放）
 * 2. 渲染端 ToolRegistry → pi customTools 工具桥（execute 经 IPC 挂起渲染端执行，
 *    onUpdate/partials 与结果回传，渲染进程断连时中止挂起调用）
 */
import type { AgentToolResult, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type {
  AssistantMessage,
  Message,
  ToolResultMessage,
  Usage,
  ImageContent,
  TextContent,
  JsonObject,
} from "@earendil-works/pi-ai";
import { existsSync, readFileSync } from "node:fs";
import type { PiHostToolCallResult, PiHostToolSpec, PiToolCallPayload } from "@/types/pi-session";
import type { RequestMessage, ResponseMessage } from "@/types";
import { Role } from "@/constants";

/** 桌面工具清单项与执行结果的桥形状见 @/types/pi-session（与渲染端共享） */

const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

/**
 * 桌面图片块 → pi ImageContent。image 字段常为 convertFileSrc 的 protocol URL——
 * 优先用 path 读文件转 base64；dataURL 直接解析；http URL 经下载转 base64。
 */
async function toPiImageContent(
  image: string,
  imagePath?: string,
  fallbackMime = "image/png",
  allowNetwork = true
): Promise<ImageContent | null> {
  if (imagePath && existsSync(imagePath)) {
    try {
      const buffer = readFileSync(imagePath);
      const extension = imagePath.slice(imagePath.lastIndexOf(".")).toLowerCase();
      return {
        type: "image",
        data: buffer.toString("base64"),
        mimeType: MIME_BY_EXTENSION[extension] ?? fallbackMime,
      };
    } catch {
      // 读文件失败继续尝试其他来源
    }
  }
  const dataUrlMatch = image.match(/^data:([^;]+);base64,(.+)$/s);
  if (dataUrlMatch) {
    return { type: "image", data: dataUrlMatch[2], mimeType: dataUrlMatch[1] };
  }
  if (allowNetwork && /^https?:\/\//.test(image)) {
    try {
      const response = await fetch(image);
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        type: "image",
        data: buffer.toString("base64"),
        mimeType: response.headers.get("content-type") || fallbackMime,
      };
    } catch {
      return null;
    }
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(image) && image.length > 64) {
    return { type: "image", data: image.replace(/\s/g, ""), mimeType: fallbackMime };
  }
  return null;
}

/** 桌面 assistant_blocks 形状的最小声明（chat-core v4，详见 packages/shared chat-core/messages.ts） */
interface AssistantBlockLike {
  turnId: string;
  type: "text" | "reasoning" | "tool_call";
  content?: string;
  toolCall?: { id: string; function: { name: string; arguments?: string } };
  execution?: {
    toolCallId?: string;
    toolName?: string;
    status?: string;
    output?: string;
    error?: string;
  };
}

const toolResultTextOf = (block: AssistantBlockLike): string => {
  const execution = block.execution;
  if (!execution) return "[No output]";
  if (execution.output?.trim()) return execution.output;
  if (execution.error?.trim()) return execution.error;
  return "[No output]";
};

const parseToolCallArguments = (raw: string | undefined): JsonObject => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as JsonObject) : {};
  } catch {
    return {};
  }
};

/** 一条带 assistant_blocks 的 ResponseMessage → pi messages（按 turn 还原，工具结果自包含） */
function responseMessageToPi(
  message: ResponseMessage,
  provider: string,
  modelId: string
): Message[] {
  const blocks = (message.assistant_blocks || []) as AssistantBlockLike[];
  if (blocks.length === 0) {
    const text = typeof message.content === "string" ? message.content : "";
    if (!text) return [];
    return [buildAssistantMessage([{ type: "text", text }], provider, modelId)];
  }

  const turnIds: string[] = [];
  blocks.forEach(block => {
    if (!turnIds.includes(block.turnId)) turnIds.push(block.turnId);
  });

  const out: Message[] = [];
  for (const turnId of turnIds) {
    const turnBlocks = blocks.filter(block => block.turnId === turnId);
    const content: AssistantMessage["content"] = [];
    const toolCalls: AssistantBlockLike[] = [];
    // 块内顺序保持：text→TextContent，tool_call→ToolCall；thinking 不回放（无签名，Anthropic 重放会 400）
    for (const block of turnBlocks) {
      if (block.type === "text" && block.content) {
        content.push({ type: "text", text: block.content });
      } else if (block.type === "tool_call") {
        const toolCall = block.toolCall;
        if (!toolCall) continue;
        toolCalls.push(block);
        content.push({
          type: "toolCall",
          id: block.execution?.toolCallId ?? toolCall.id,
          name: toolCall.function.name,
          arguments: parseToolCallArguments(toolCall.function.arguments),
        });
      }
    }
    if (content.length === 0) continue;
    out.push(
      buildAssistantMessage(content, provider, modelId, toolCalls.length > 0 ? "toolUse" : "stop")
    );
    for (const block of toolCalls) {
      const toolCall = block.toolCall!;
      const result: ToolResultMessage = {
        role: "toolResult",
        toolCallId: block.execution?.toolCallId ?? toolCall.id,
        toolName: block.execution?.toolName ?? toolCall.function.name,
        content: [{ type: "text", text: toolResultTextOf(block) }],
        isError: block.execution?.status === "failed",
        usage: ZERO_USAGE,
        timestamp: Date.now(),
      };
      out.push(result);
    }
  }
  return out;
}

function buildAssistantMessage(
  content: AssistantMessage["content"],
  provider: string,
  modelId: string,
  stopReason: AssistantMessage["stopReason"] = "stop"
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider,
    model: modelId,
    usage: ZERO_USAGE,
    stopReason,
    timestamp: Date.now(),
  };
}

/**
 * 桌面 chat-core 消息序列 → pi messages（历史灌入）。
 * system 消息不灌入（pi 体系 systemPrompt 由会话装配承载）；Role.Tool 消息不灌入
 * （工具结果自包含在 assistant_blocks 的 execution 里，见 responseMessageToPi）。
 */
export async function desktopMessagesToPi(
  messages: RequestMessage[],
  provider: string,
  modelId: string,
  /**
   * 是否允许为远程图片发起下载。启动迁移时必须关掉：迁移跑在开库路径上，
   * 几百张远程图挨个下载会把开库卡住（断网时每张还要等超时）。关掉时远程图不进模型上下文，
   * 界面仍按展示 entry 显示原图。
   */
  options: { allowNetwork?: boolean } = {}
): Promise<Message[]> {
  const allowNetwork = options.allowNetwork ?? true;
  const out: Message[] = [];
  for (const message of messages) {
    if (message.role === Role.System || message.role === Role.Tool) continue;

    if (message.role === Role.User) {
      if (typeof message.content === "string") {
        out.push({ role: "user", content: message.content, timestamp: Date.now() });
        continue;
      }
      const content: (TextContent | ImageContent)[] = [];
      for (const block of message.content || []) {
        if (block.type === "text") {
          if (block.text) content.push({ type: "text", text: block.text });
        } else if (block.type === "image") {
          const image = await toPiImageContent(block.image, block.path, "image/png", allowNetwork);
          if (image) content.push(image);
        } else if (block.type === "file") {
          content.push({
            type: "text",
            text: `[文件：${block.fileName ?? block.file}]（可用 read 工具读取）`,
          });
        }
      }
      if (content.length > 0) {
        out.push({ role: "user", content, timestamp: Date.now() });
      }
      continue;
    }

    if (message.role === Role.Assistant) {
      out.push(...responseMessageToPi(message as ResponseMessage, provider, modelId));
    }
  }
  return out;
}

/** 工具桥：渲染端 IPC 挂起执行的桥接线（每会话一个实例） */
/** 工具调用的派发目标：渲染窗口（经 pi-tool-call IPC）或别的执行方（M5：扩展页面工具经 WS） */
export interface PiToolCallTarget {
  isDestroyed(): boolean;
  send(channel: "pi-tool-call", payload: PiToolCallPayload): void;
}

export class PiToolCallBridge {
  private readonly pending = new Map<
    string,
    {
      resolve: (result: AgentToolResult) => void;
      reject: (error: Error) => void;
      onUpdate?: (partial: AgentToolResult) => void;
    }
  >();

  constructor(
    private readonly sender: PiToolCallTarget,
    private readonly sessionId: string
  ) {}

  public toToolDefinitions(specs: PiHostToolSpec[]): ToolDefinition[] {
    return specs.map(spec => ({
      name: spec.name,
      label: spec.name,
      description: spec.description,
      parameters: spec.parameters as ToolDefinition["parameters"],
      execute: (toolCallId, params, signal, onUpdate) =>
        this.execute(spec.name, toolCallId, params, signal, onUpdate),
    }));
  }

  private execute(
    toolName: string,
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: ((partial: AgentToolResult) => void) | undefined
  ): Promise<AgentToolResult> {
    return new Promise<AgentToolResult>((resolve, reject) => {
      const pendingEntry = {
        resolve,
        reject,
        ...(onUpdate ? { onUpdate } : {}),
      };
      this.pending.set(toolCallId, pendingEntry);
      const onAbort = () => {
        if (!this.pending.has(toolCallId)) return;
        this.pending.delete(toolCallId);
        reject(new Error("工具执行已中止"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      if (this.sender.isDestroyed()) {
        onAbort();
        return;
      }
      this.sender.send("pi-tool-call", {
        sessionId: this.sessionId,
        toolCallId,
        toolName,
        args: params,
      });
    });
  }

  /** 渲染端回传执行进度（tool_execution_update 的 partialResult） */
  public handleUpdate(toolCallId: string, partial: Record<string, unknown>): void {
    this.pending.get(toolCallId)?.onUpdate?.({
      content: [],
      details: partial as never,
    });
  }

  /** 渲染端回传执行结果 */
  public handleResult(toolCallId: string, result: PiHostToolCallResult): void {
    const pending = this.pending.get(toolCallId);
    if (!pending) return;
    this.pending.delete(toolCallId);
    pending.resolve({
      content: [{ type: "text", text: result.modelContent ?? result.content ?? "" }],
      details: result.metadata as never,
    });
  }

  /** 渲染端回传执行失败 */
  public handleError(toolCallId: string, errorMessage: string): void {
    const pending = this.pending.get(toolCallId);
    if (!pending) return;
    this.pending.delete(toolCallId);
    pending.resolve({
      content: [{ type: "text", text: `工具执行失败：${errorMessage}` }],
      details: { isError: true, error: errorMessage } as never,
    });
  }

  /** 渲染进程销毁/会话释放时中止全部挂起 */
  public dispose(): void {
    for (const [toolCallId, pending] of this.pending) {
      this.pending.delete(toolCallId);
      pending.reject(new Error("会话已关闭，工具执行中止"));
    }
  }
}
