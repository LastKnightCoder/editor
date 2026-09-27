/**
 * pi 工具桥（渲染端）：主进程 pi customTools 的 execute 经 pi-tool-call 事件派发到此，
 * 路由 ToolRegistry 执行后经 pi-session:tool-* 回传。会话上下文（conversationKey/toolScope）
 * 由 piChatSession 在创建会话时注册——ask_question 等工具靠 conversationKey 定位会话记录。
 * 一次性会话（piAgentRunner）可经 executeToolCall 上下文接管 additionalTools 的执行。
 */
import { onPiToolCall, piSessionToolError, piSessionToolResult } from "@/commands/piSession";
import toolRegistry, { ensureToolingReady } from "@/tools";
import type { MessageContent, ToolCallPayload } from "@/types";
import type { PiHostToolCallResult, PiToolCallPayload } from "@/types/pi-session";
import { initToolApprovals } from "./tool-permission/approvalStore";

/** 会话级执行器（一次性会话的 additionalTools 路由）：返回 null 表示未接管，落回 ToolRegistry */
export type PiToolCallExecutor = (
  payload: PiToolCallPayload
) => Promise<PiHostToolCallResult | null>;

export interface PiToolSessionContext {
  conversationKey?: string;
  toolContext?: Record<string, unknown>;
  executeToolCall?: PiToolCallExecutor;
}

const sessionContexts = new Map<string, PiToolSessionContext>();

export function registerPiToolSessionContext(
  sessionId: string,
  context: PiToolSessionContext
): void {
  sessionContexts.set(sessionId, context);
}

export function unregisterPiToolSessionContext(sessionId: string): void {
  sessionContexts.delete(sessionId);
}

/** 消息块数组（modelContent）→ 发给模型的纯文本 */
const modelTextOf = (blocks: MessageContent[] | undefined): string | undefined => {
  if (!blocks) return undefined;
  return blocks
    .map(block =>
      block.type === "text"
        ? block.text
        : block.type === "image"
          ? "[图片]"
          : `[文件：${block.fileName ?? ""}]`
    )
    .join("\n");
};

const toBridgeResult = (result: {
  content?: string;
  modelContent?: MessageContent[];
  metadata?: Record<string, unknown>;
  isParameterError?: boolean;
}): PiHostToolCallResult => {
  const modelText = modelTextOf(result.modelContent);
  return {
    content: result.content ?? "",
    ...(modelText !== undefined ? { modelContent: modelText } : {}),
    ...(result.metadata !== undefined ? { metadata: result.metadata } : {}),
    ...(result.isParameterError ? { isError: true } : {}),
  };
};

let initialized = false;

/** 应用启动时挂载一次（模块加载即执行，事件监听随 preload 常驻） */
export function initPiToolBridge(): void {
  if (initialized) return;
  initialized = true;
  initToolApprovals();
  ensureToolingReady();

  onPiToolCall(payload => {
    const { sessionId, toolCallId, toolName, args } = payload;
    void (async () => {
      const context = sessionContexts.get(sessionId);
      try {
        if (context?.executeToolCall) {
          const override = await context.executeToolCall(payload);
          if (override) {
            await piSessionToolResult(sessionId, toolCallId, override);
            return;
          }
        }
        const call: ToolCallPayload = {
          id: toolCallId,
          function: {
            name: toolName,
            arguments: args === undefined ? "" : JSON.stringify(args),
          },
        };
        const result = await toolRegistry.executeToolCall(call, {
          conversationKey: context?.conversationKey,
          toolContext: context?.toolContext,
        });
        if (!result) {
          await piSessionToolError(sessionId, toolCallId, "工具执行未返回结果");
          return;
        }
        await piSessionToolResult(sessionId, toolCallId, toBridgeResult(result));
      } catch (error) {
        await piSessionToolError(
          sessionId,
          toolCallId,
          error instanceof Error ? error.message : String(error)
        );
      }
    })();
  });
}
