/**
 * 一次性 pi 会话运行器（带工具路径的统一底座）：创建 inMemory 会话（含工具桥清单与
 * 历史灌入）→ prompt → 事件流回调 → agent_settled 后 dispose。生成编排（vibe_learning）、
 * 行内助手、aiServer、子代理调研等非主聊天带工具场景全部经此。
 * 事件为 pi 原生 AgentSessionEvent；消费方用 services/piChatEvents 的 reducer 或自行归约。
 */
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { RequestMessage } from "@/types";
import type { LLMModelSetting, LLMProviderSetting, PiThinkingLevel } from "@/types/pi-llm";
import type { PiHostToolSpec } from "@/types/pi-session";
import {
  onPiSessionEvent,
  piSessionAbort,
  piSessionCreate,
  piSessionDispose,
  piSessionPrompt,
} from "@/commands/piSession";
import { toPiChatMessages } from "@/services/piLLM";
import { getToolRegistryAgentTools } from "@/agent/toolRegistryAgentTools";
import {
  initPiToolBridge,
  registerPiToolSessionContext,
  unregisterPiToolSessionContext,
} from "@/services/piToolBridge";

export interface PiAgentRunOptions {
  provider: LLMProviderSetting;
  model: LLMModelSetting;
  /** chat-core 消息（system 抽出为会话 systemPrompt；最后一条 user 作为 prompt 文本） */
  messages: RequestMessage[];
  /** 思考档位；缺省交给 pi 按模型能力取默认 */
  thinking?: PiThinkingLevel;
  toolScope?: string;
  /** 工具名排除清单（子代理防递归等） */
  excludeToolNames?: string[];
  conversationKey?: string;
  toolContext?: Record<string, unknown>;
  cwd?: string;
  /** 额外工具（覆盖注册表同名），执行经 executeAdditionalTool 路由 */
  additionalTools?: Array<{
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }>;
  executeAdditionalTool?: (payload: { toolName: string; args: unknown }) => Promise<{
    content: string;
    modelContent?: string;
    metadata?: Record<string, unknown>;
  } | null>;
}

export interface PiAgentRunResult {
  ok: boolean;
  error?: string;
  /** 最后一条 assistant 消息的正文（工具循环全部结束后） */
  lastAssistantText: string;
  /** 是否被 abort 中止 */
  aborted: boolean;
}

export interface PiAgentRunHandle {
  result: Promise<PiAgentRunResult>;
  abort(): void;
}

export function runPiAgent(
  options: PiAgentRunOptions,
  onEvent?: (event: AgentSessionEvent) => void
): PiAgentRunHandle {
  initPiToolBridge();
  const sessionId = crypto.randomUUID();
  let settled = false;
  let aborted = false;

  const result = (async (): Promise<PiAgentRunResult> => {
    try {
      const { system } = toPiChatMessages(options.messages);
      const lastMessage = options.messages.at(-1);
      if (!lastMessage || lastMessage.role !== ("user" as never)) {
        return {
          ok: false,
          error: "runPiAgent 需要最后一条消息为 user",
          lastAssistantText: "",
          aborted: false,
        };
      }
      // 历史灌入排除最后一条 user（其文本作为 prompt 单独发送）
      const initialMessages = options.messages.slice(0, -1);
      const customTools = buildToolSpecs(options);
      const thinkingLevel = options.thinking;

      const created = await piSessionCreate(sessionId, {
        scope: options.conversationKey ?? `one-shot:${sessionId}`,
        cwd: options.cwd ?? "",
        modelRef: { providerId: options.provider.id, modelId: options.model.id },
        ...(system !== undefined ? { systemPrompt: system } : {}),
        persist: false,
        interactive: false,
        ...(customTools.length > 0 ? { customTools } : {}),
        ...(thinkingLevel ? { thinkingLevel } : {}),
        ...(initialMessages.length > 0 ? { initialMessages } : {}),
      });
      if (!created.ok) {
        return { ok: false, error: created.error, lastAssistantText: "", aborted: false };
      }

      registerPiToolSessionContext(sessionId, {
        ...(options.conversationKey ? { conversationKey: options.conversationKey } : {}),
        ...(options.toolContext ? { toolContext: options.toolContext } : {}),
        ...(options.additionalTools && options.executeAdditionalTool
          ? {
              executeToolCall: async payload => {
                const names = new Set(options.additionalTools!.map(tool => tool.function.name));
                if (!names.has(payload.toolName)) return null;
                const executed = await options.executeAdditionalTool!({
                  toolName: payload.toolName,
                  args: payload.args,
                });
                return executed ?? null;
              },
            }
          : {}),
      });

      let lastAssistantText = "";
      const unsubscribe = onPiSessionEvent(sessionId, event => {
        if (event.type === "message_end" && event.message.role === "assistant") {
          const message = event.message as unknown as {
            content: Array<{ type: string; text?: string }>;
          };
          const text = message.content
            .filter(block => block.type === "text")
            .map(block => block.text ?? "")
            .join("\n\n");
          if (text) lastAssistantText = text;
        }
        if (event.type === "agent_settled") settled = true;
        onEvent?.(event);
      });

      const contentItems = Array.isArray(lastMessage.content)
        ? lastMessage.content
        : [{ type: "text" as const, text: lastMessage.content as string }];
      const promptText = contentItems
        .filter(item => item.type === "text")
        .map(item => item.text)
        .join("\n");
      // 图片只传定位信息（image 字段可能是 protocol URL，path 才是真实路径），主进程读文件转 base64
      const images = contentItems
        .filter(item => item.type === "image")
        .map(item =>
          item.image.startsWith("data:")
            ? { dataUrl: item.image }
            : { path: item.path ?? item.image }
        );

      const prompted = await piSessionPrompt(sessionId, promptText, images);
      if (!prompted.ok) {
        unsubscribe();
        unregisterPiToolSessionContext(sessionId);
        await piSessionDispose(sessionId);
        return { ok: false, error: prompted.error, lastAssistantText: "", aborted: false };
      }

      // prompt resolve 只代表提交；等待 agent_settled
      await new Promise<void>(resolve => {
        const check = () => (settled ? resolve() : setTimeout(check, 50));
        check();
      });
      unsubscribe();
      unregisterPiToolSessionContext(sessionId);
      await piSessionDispose(sessionId);
      return { ok: true, lastAssistantText, aborted };
    } catch (error) {
      unregisterPiToolSessionContext(sessionId);
      void piSessionDispose(sessionId);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        lastAssistantText: "",
        aborted,
      };
    }
  })();

  return {
    result,
    abort: () => {
      if (!settled) {
        aborted = true;
        void piSessionAbort(sessionId);
      }
    },
  };
}

export interface BrowserSessionTurnOptions extends Pick<
  PiAgentRunOptions,
  "provider" | "model" | "conversationKey" | "additionalTools" | "executeAdditionalTool"
> {
  /** 扩展对话 id = pi 会话 id（首轮以它新建，之后按它在页面目录里找文件恢复） */
  sessionId: string;
  pageUrl: string;
  systemPrompt: string;
  /** 本轮的用户消息（历史由 pi 从会话文件恢复，扩展不再拼历史） */
  message: RequestMessage | undefined;
}

/**
 * 浏览器扩展侧栏的一轮持久对话（M4.5）：会话落在 `browser-sessions/<页面键>/`，
 * 每轮从文件恢复宿主会话、prompt、agent_settled 后释放（扩展没有常驻宿主）。
 * 用户消息的展示形态随 prompt 写成展示 entry，重开时照原样显示。
 * 标题：用户改名写 pi session name；没改过时列表取首条用户消息（SessionManager.list 自带）。
 */
export function runBrowserSessionTurn(
  options: BrowserSessionTurnOptions,
  onEvent?: (event: AgentSessionEvent) => void
): PiAgentRunHandle {
  initPiToolBridge();
  const hostId = crypto.randomUUID();
  let settled = false;
  let aborted = false;
  const result = (async (): Promise<PiAgentRunResult> => {
    const message = options.message;
    if (!message || message.role !== ("user" as never)) {
      return { ok: false, error: "缺少本轮的用户消息", lastAssistantText: "", aborted: false };
    }
    try {
      const customTools = buildToolSpecs(options);
      const created = await piSessionCreate(hostId, {
        scope: options.conversationKey ?? `browser:${options.sessionId}`,
        cwd: "",
        modelRef: { providerId: options.provider.id, modelId: options.model.id },
        systemPrompt: options.systemPrompt,
        // 扩展没有审批条与提问卡：需确认的工具直接拒绝，不注册 ask-question
        interactive: false,
        piSessionId: options.sessionId,
        browserPageUrl: options.pageUrl,
        ...(customTools.length > 0 ? { customTools } : {}),
      });
      if (!created.ok) {
        return { ok: false, error: created.error, lastAssistantText: "", aborted: false };
      }
      registerPiToolSessionContext(hostId, {
        ...(options.conversationKey ? { conversationKey: options.conversationKey } : {}),
        ...(options.additionalTools && options.executeAdditionalTool
          ? {
              executeToolCall: async payload => {
                const names = new Set(options.additionalTools!.map(tool => tool.function.name));
                if (!names.has(payload.toolName)) return null;
                return (
                  (await options.executeAdditionalTool!({
                    toolName: payload.toolName,
                    args: payload.args,
                  })) ?? null
                );
              },
            }
          : {}),
      });
      let lastAssistantText = "";
      const unsubscribe = onPiSessionEvent(hostId, event => {
        if (event.type === "message_end" && event.message.role === "assistant") {
          const text = (
            event.message as unknown as { content: Array<{ type: string; text?: string }> }
          ).content
            .filter(block => block.type === "text")
            .map(block => block.text ?? "")
            .join("\n\n");
          if (text) lastAssistantText = text;
        }
        if (event.type === "agent_settled") settled = true;
        onEvent?.(event);
      });
      const contentItems = Array.isArray(message.content)
        ? message.content
        : [{ type: "text" as const, text: message.content as string }];
      const promptText = contentItems
        .map(item =>
          item.type === "text"
            ? item.text
            : item.type === "file"
              ? `[文件：${item.fileName ?? item.file}]\n路径：${item.file}\n请使用 pi 的 read 工具读取该文件。`
              : ""
        )
        .filter(Boolean)
        .join("\n");
      const images = contentItems
        .filter(item => item.type === "image")
        .map(item =>
          item.image.startsWith("data:")
            ? { dataUrl: item.image }
            : { path: item.path ?? item.image }
        );
      const release = async () => {
        unsubscribe();
        unregisterPiToolSessionContext(hostId);
        await piSessionDispose(hostId);
      };
      const prompted = await piSessionPrompt(hostId, promptText, images, {
        content: contentItems,
        ...(message.clientId ? { clientId: message.clientId } : {}),
      });
      if (!prompted.ok) {
        await release();
        return { ok: false, error: prompted.error, lastAssistantText: "", aborted: false };
      }
      await new Promise<void>(resolve => {
        const check = () => (settled ? resolve() : setTimeout(check, 50));
        check();
      });
      await release();
      return { ok: true, lastAssistantText, aborted };
    } catch (error) {
      unregisterPiToolSessionContext(hostId);
      void piSessionDispose(hostId);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        lastAssistantText: "",
        aborted,
      };
    }
  })();
  return {
    result,
    abort: () => {
      if (!settled) {
        aborted = true;
        void piSessionAbort(hostId);
      }
    },
  };
}

function buildToolSpecs(
  options: Pick<PiAgentRunOptions, "toolScope" | "excludeToolNames" | "additionalTools">
): PiHostToolSpec[] {
  const registryTools = getToolRegistryAgentTools({
    includeBuiltinSkillTools: true,
    ...(options.toolScope ? { toolScope: options.toolScope } : {}),
  }).filter(tool => !options.excludeToolNames?.includes(tool.name));
  const additional = options.additionalTools ?? [];
  const additionalNames = new Set(additional.map(tool => tool.function.name));
  const specs: PiHostToolSpec[] = registryTools
    .filter(tool => !additionalNames.has(tool.name))
    .map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
      risk: tool.risk ?? "read",
      source: tool.source,
    }));
  for (const tool of additional) {
    specs.push({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
      // 同 piChatSession.buildToolLoadout：额外工具只读页面，不声明会在不可交互入口被拒
      risk: "read",
    });
  }
  // 按名字排序：工具定义渲染在请求最前，注册表顺序（MCP 异步连接先后）会让同类
  // 一次性调用之间反复丢提示缓存
  specs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return specs;
}
