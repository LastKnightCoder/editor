/**
 * pi 工具桥（渲染端）：主进程 pi customTools 的 execute 经 pi-tool-call 事件派发到此，
 * 路由 ToolRegistry 执行后经 pi-session:tool-* 回传。会话上下文（conversationKey/toolScope）
 * 由 piChatSession 在创建会话时注册。
 * 一次性会话（piAgentRunner）可经 executeToolCall 上下文接管 additionalTools 的执行。
 */
import {
  onPiToolCall,
  onPiToolCancel,
  piSessionToolError,
  piSessionToolResult,
} from "@/commands/piSession";
import toolRegistry, { ensureToolingReady } from "@/tools";
import type { MessageContent, ToolCallPayload } from "@/types";
import type { PiHostToolCallResult, PiToolCallPayload } from "@/types/pi-session";
import { initPiInteractions } from "./piInteractions";
import type { RegisteredTool } from "@/tools/toolRegistry";

/** 会话级执行器（一次性会话的 additionalTools 路由）：返回 null 表示未接管，落回 ToolRegistry */
export type PiToolCallExecutor = (
  payload: PiToolCallPayload,
  signal: AbortSignal
) => Promise<PiHostToolCallResult | null>;

export interface PiToolSessionContext {
  databaseName?: string;
  sessionTools?: RegisteredTool[];
  toolScope?: string;
  scopedTools?: RegisteredTool[];
  conversationKey?: string;
  toolContext?: Record<string, unknown>;
  executeToolCall?: PiToolCallExecutor;
}

const sessionContexts = new Map<string, PiToolSessionContext>();
const calls = new Map<string, { sessionId: string; controller: AbortController }>();
const callKey = (sessionId: string, toolCallId: string, executionId?: string) =>
  JSON.stringify([sessionId, toolCallId, executionId]);

export function registerPiToolSessionContext(
  sessionId: string,
  context: PiToolSessionContext
): void {
  sessionContexts.set(sessionId, context);
}

export function unregisterPiToolSessionContext(sessionId: string): void {
  for (const call of calls.values()) if (call.sessionId === sessionId) call.controller.abort();
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
  isCancelled?: boolean;
}): PiHostToolCallResult => {
  const modelText = modelTextOf(result.modelContent);
  return {
    content: result.content ?? "",
    ...(modelText !== undefined ? { modelContent: modelText } : {}),
    ...(result.metadata !== undefined ? { metadata: result.metadata } : {}),
    ...(result.isParameterError || result.isCancelled || result.metadata?.isError === true
      ? { isError: true }
      : {}),
  };
};

let initialized = false;

/** 应用启动时挂载一次（模块加载即执行，事件监听随 preload 常驻） */
export function initPiToolBridge(): void {
  if (initialized) return;
  initialized = true;
  initPiInteractions();
  ensureToolingReady();

  onPiToolCancel(({ sessionId, toolCallId, executionId }) => {
    calls.get(callKey(sessionId, toolCallId, executionId))?.controller.abort();
  });

  onPiToolCall(payload => {
    const { sessionId, toolCallId, toolName, args, executionId } = payload;
    const key = callKey(sessionId, toolCallId, executionId);
    if (calls.has(key)) return;
    const controller = new AbortController();
    calls.set(key, { sessionId, controller });
    void (async () => {
      const context = sessionContexts.get(sessionId);
      try {
        if (!context) throw new Error("工具会话上下文已失效，请重新发起回答");
        if (context?.executeToolCall) {
          const override = await context.executeToolCall(payload, controller.signal);
          controller.signal.throwIfAborted();
          if (override) {
            await piSessionToolResult(sessionId, toolCallId, override, executionId);
            return;
          }
        }
        if (!context.databaseName) throw new Error("会话所属数据库尚未就绪，请重新发起回答");
        const call: ToolCallPayload = {
          id: toolCallId,
          function: {
            name: toolName,
            arguments: args === undefined ? "" : JSON.stringify(args),
          },
        };
        const result = await toolRegistry.executeToolCall(call, {
          signal: controller.signal,
          databaseName: context.databaseName,
          sessionTools: context.sessionTools ?? context.scopedTools ?? [],
          scopedTools: context?.scopedTools,
          conversationKey: context?.conversationKey,
          toolContext: context?.toolContext,
        });
        if (!result) {
          await piSessionToolError(sessionId, toolCallId, "工具执行未返回结果", executionId);
          return;
        }
        await piSessionToolResult(sessionId, toolCallId, toBridgeResult(result), executionId);
      } catch (error) {
        await piSessionToolError(
          sessionId,
          toolCallId,
          error instanceof Error ? error.message : String(error),
          executionId
        );
      } finally {
        calls.delete(key);
      }
    })().catch(error => console.error("[pi-tool] 回传工具终态失败", error));
  });
}
