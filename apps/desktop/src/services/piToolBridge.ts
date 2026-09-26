/**
 * pi 工具桥（渲染端）：主进程 pi customTools 的 execute 经 pi-tool-call 事件派发到此，
 * 路由 ToolRegistry 执行后经 pi-session:tool-* 回传。会话上下文（conversationKey/toolScope）
 * 由 piChatSession 在创建会话时注册——ask_question 等工具靠 conversationKey 定位会话记录。
 */
import { onPiToolCall, piSessionToolError, piSessionToolResult } from "@/commands/piSession";
import toolRegistry, { ensureToolingReady } from "@/tools";
import type { MessageContent } from "@/types";
import type { PiHostToolCallResult } from "@/types/pi-session";

/** modelContent（消息块数组）→ 发给模型的纯文本 */
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

interface PiToolSessionContext {
  conversationKey?: string;
  toolContext?: Record<string, unknown>;
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

let initialized = false;

/** 应用启动时挂载一次（模块加载即执行，事件监听随 preload 常驻） */
export function initPiToolBridge(): void {
  if (initialized) return;
  initialized = true;
  ensureToolingReady();

  onPiToolCall(payload => {
    const { sessionId, toolCallId, toolName, args } = payload;
    void (async () => {
      const context = sessionContexts.get(sessionId);
      try {
        const result = await toolRegistry.executeToolCall(
          {
            id: toolCallId,
            function: {
              name: toolName,
              arguments: args === undefined ? "" : JSON.stringify(args),
            },
          },
          {
            conversationKey: context?.conversationKey,
            toolContext: context?.toolContext,
          }
        );
        if (!result) {
          await piSessionToolError(sessionId, toolCallId, "工具执行未返回结果");
          return;
        }
        const modelText = modelTextOf(result.modelContent);
        const bridgeResult: PiHostToolCallResult = {
          content: result.content ?? "",
          ...(modelText !== undefined ? { modelContent: modelText } : {}),
          ...(result.metadata !== undefined ? { metadata: result.metadata } : {}),
          ...(result.isParameterError ? { isError: true } : {}),
        };
        await piSessionToolResult(sessionId, toolCallId, bridgeResult);
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
