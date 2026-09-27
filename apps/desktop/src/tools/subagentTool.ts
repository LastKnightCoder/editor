import {
  buildSubAgentResearchMetadata,
  createInitialSubAgentResearchPayload,
  runSubAgentResearch,
  SUBAGENT_RESEARCH_RENDERER_KEY,
  SUBAGENT_RESEARCH_TOOL_NAME,
  type SubAgentResearchPayload,
  type SubAgentResearchTask,
} from "@/agent/subagentResearch";
import { subAgentResearchStore } from "@/agent/subagentResearchStore";
import { runPiAgent } from "@/services/piAgentRunner";
import { PiChatEventReducer } from "@/services/piChatEvents";
import { buildPiChatSystemPrompt } from "@/services/piChatSession";
import useSettingStore from "@/stores/useSettingStore";
import useSkillStore from "@/stores/useSkillStore";
import { Role } from "@/constants";
import type { LLMModelSetting, LLMProviderSetting } from "@/types/pi-llm";
import type { Skill, ToolDefinition, ToolExecutionContext, ToolExecutionResult } from "@/types";

export { SUBAGENT_RESEARCH_RENDERER_KEY, SUBAGENT_RESEARCH_TOOL_NAME };

interface SubAgentToolArgs {
  tasks?: Array<{
    id?: string;
    title?: string;
    prompt?: string;
  }>;
  context?: string;
  maxConcurrency?: number;
  maxToolCallLoops?: number;
  timeoutMs?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const normalizeTasks = (rawTasks: SubAgentToolArgs["tasks"]): SubAgentResearchTask[] | null => {
  if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
    return null;
  }

  const seenIds = new Set<string>();
  const tasks: SubAgentResearchTask[] = [];

  for (let index = 0; index < rawTasks.length; index += 1) {
    const rawTask = rawTasks[index];
    const title = rawTask?.title?.trim();
    const prompt = rawTask?.prompt?.trim();
    if (!title || !prompt) {
      return null;
    }
    const id = (rawTask.id?.trim() || `task-${index + 1}`).replace(/\s+/g, "-");
    if (seenIds.has(id)) {
      return null;
    }
    seenIds.add(id);
    tasks.push({ id, title, prompt });
  }

  return tasks;
};

const normalizePositiveInteger = (value: unknown, fallback: number, max: number) => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(max, Math.floor(numeric));
};

/** 子代理直接用当前对话配置的 provider/model（与父会话同源） */
const resolveChatLLMConfig = (): {
  provider: LLMProviderSetting;
  model: LLMModelSetting;
} | null => {
  const setting = useSettingStore.getState().setting;
  const usage = setting.llmUsageSettings.chat;
  if (!usage) return null;
  const provider = setting.llmProviders.find(
    (item: LLMProviderSetting) => item.id === usage.providerId
  );
  const model = provider?.models.find((item: LLMModelSetting) => item.id === usage.modelId);
  if (!provider || !model) return null;
  return { provider, model };
};

const resolveToolScope = (context?: ToolExecutionContext): string | undefined => {
  const runtime = isRecord(context?.toolContext) ? context.toolContext : {};
  return typeof runtime.toolScope === "string" ? runtime.toolScope : undefined;
};

const buildSummary = (payload: SubAgentResearchPayload) => {
  const successful = payload.tasks.filter(task => task.status === "success");
  const failed = payload.tasks.filter(task => task.status === "failed");
  const cancelled = payload.tasks.filter(task => task.status === "cancelled");
  const lines = [
    `SubAgent 调研状态：${payload.status}`,
    `完成 ${successful.length} 个，失败 ${failed.length} 个，取消 ${cancelled.length} 个。`,
    ...successful.map(task => `- ${task.title}: ${task.answer || "无结论"}`),
  ];

  if (failed.length > 0) {
    lines.push(...failed.map(task => `- ${task.title} 失败: ${task.error}`));
  }
  if (cancelled.length > 0) {
    lines.push(...cancelled.map(task => `- ${task.title}: 已取消`));
  }

  return lines.join("\n");
};

export const buildSubAgentResearchMetadataFromInput = (toolCallId: string, rawInput: string) => {
  try {
    const parsed = rawInput.trim() ? (JSON.parse(rawInput) as SubAgentToolArgs) : {};
    const tasks = normalizeTasks(parsed.tasks) || [];
    return buildSubAgentResearchMetadata(createInitialSubAgentResearchPayload(toolCallId, tasks));
  } catch {
    return buildSubAgentResearchMetadata(createInitialSubAgentResearchPayload(toolCallId, []));
  }
};

export const createSubAgentResearchTool = (): ToolDefinition => ({
  name: SUBAGENT_RESEARCH_TOOL_NAME,
  description:
    "并发启动多个 SubAgent 独立执行任务，并在全部完成后返回聚合结论。适合把复杂问题拆分给多个子 Agent 分别查证或处理。",
  parameters: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        description: "要并发调研的子任务列表。",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "可选任务 ID。" },
            title: { type: "string", description: "子任务标题。" },
            prompt: { type: "string", description: "子任务调研指令。" },
          },
          required: ["title", "prompt"],
          additionalProperties: false,
        },
      },
      context: {
        type: "string",
        description: "所有 SubAgent 共享的背景上下文。",
      },
      maxConcurrency: {
        type: "number",
        description: "最大并发数，默认 3，最大 5。",
      },
      maxToolCallLoops: {
        type: "number",
        description: "每个 SubAgent 的最大工具调用轮数，默认 6，最大 10。",
      },
      timeoutMs: {
        type: "number",
        description: "SubAgent 内部单次工具调用超时时间，默认 30000，最大 300000。",
      },
    },
    required: ["tasks"],
    additionalProperties: false,
  },
  executor: async (args, context): Promise<ToolExecutionResult> => {
    const parsed = args as SubAgentToolArgs;
    const tasks = normalizeTasks(parsed.tasks);
    if (!tasks) {
      return {
        content: "参数错误：tasks 必须是非空数组，且每个任务需要唯一 id、title 和 prompt。",
        isParameterError: true,
      };
    }

    const chatConfig = resolveChatLLMConfig();
    if (!chatConfig) {
      return {
        content: "SubAgent 无法启动：缺少当前模型运行配置。",
        isParameterError: true,
      };
    }

    const sessionId = context?.toolCallId || `subagent-${Date.now()}`;
    const maxConcurrency = normalizePositiveInteger(parsed.maxConcurrency, 3, 5);

    const initialPayload = createInitialSubAgentResearchPayload(sessionId, tasks);
    subAgentResearchStore.setSession(initialPayload);

    const skills: Skill[] = useSkillStore.getState().skills;
    const toolScope = resolveToolScope(context);
    const subAgentSystem = buildPiChatSystemPrompt(
      "你是独立执行任务的 SubAgent。可以使用当前可用工具完成任务；涉及危险操作时遵循工具层确认机制。输出要简明，并说明关键依据。",
      skills,
      []
    );

    const payload = await runSubAgentResearch({
      sessionId,
      tasks,
      maxConcurrency,
      signal: context?.signal,
      onUpdate: nextPayload => {
        subAgentResearchStore.setSession(nextPayload);
      },
      runTask: async ({ task, signal, updateTask }) => {
        const noop = () => {};
        const executionsReducer = new PiChatEventReducer({
          applyText: noop,
          applyReasoning: noop,
          applyToolCalls: noop,
          finalizeTurn: noop,
          applyUsage: noop,
          onAssistantTurnEnd: noop,
          onRetryStatus: noop,
          onStreamError: noop,
          onSettled: noop,
        });
        const handle = runPiAgent(
          {
            provider: chatConfig.provider,
            model: chatConfig.model,
            messages: [
              { role: Role.System, content: subAgentSystem },
              {
                role: Role.User,
                content: [
                  parsed.context
                    ? `共享上下文：\n${parsed.context}\n\n任务：\n${task.prompt}`
                    : task.prompt,
                ].join(""),
              },
            ],
            ...(context?.conversationKey
              ? { conversationKey: `${context.conversationKey}:subagent:${task.id}` }
              : {}),
            ...(toolScope ? { toolScope } : {}),
            excludeToolNames: [SUBAGENT_RESEARCH_TOOL_NAME],
          },
          event => {
            executionsReducer.handle(event);
            if (event.type === "message_update" && event.message.role === "assistant") {
              const message = event.message as unknown as {
                content: Array<{ type: string; text?: string; thinking?: string }>;
              };
              const text = message.content
                .filter(block => block.type === "text")
                .map(block => block.text ?? "")
                .join("\n\n");
              const reasoning = message.content
                .filter(block => block.type === "thinking")
                .map(block => block.thinking ?? "")
                .join("\n\n");
              if (text) updateTask({ progressText: text });
              if (reasoning) updateTask({ reasoning, reasoningPreview: reasoning });
              return;
            }
            if (event.type.startsWith("tool_execution_")) {
              const toolEvent = event as unknown as {
                toolName: string;
                isError?: boolean;
              };
              updateTask(
                { toolExecutions: [...executionsReducer.getExecutions()] },
                {
                  time: Date.now(),
                  type: "tool",
                  message: `调用 ${toolEvent.toolName}: ${event.type === "tool_execution_end" ? (toolEvent.isError ? "failed" : "success") : event.type === "tool_execution_start" ? "executing" : "update"}`,
                }
              );
            }
          }
        );
        const onAbort = () => handle.abort();
        signal.addEventListener("abort", onAbort, { once: true });
        try {
          const result = await handle.result;
          if (!result.ok && !result.aborted) {
            throw new Error(result.error ?? "SubAgent 请求失败");
          }
          return {
            answer: result.lastAssistantText || "SubAgent 未返回文本结论。",
          };
        } finally {
          signal.removeEventListener("abort", onAbort);
        }
      },
    });

    const summary = buildSummary(payload);
    const finalPayload = {
      ...payload,
      summary,
    };
    subAgentResearchStore.setSession(finalPayload);

    return {
      content: summary,
      metadata: buildSubAgentResearchMetadata(finalPayload),
      isCancelled: payload.status === "cancelled",
    };
  },
});
