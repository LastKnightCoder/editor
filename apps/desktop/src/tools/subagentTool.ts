import {
  Agent,
  composeAgentModel,
  type AgentToolExecutionState,
} from "@tau/agent";

import { DesktopModelProtocolAdapter } from "@/agent/DesktopModelProtocolAdapter";
import { DesktopModelTransport } from "@/agent/DesktopModelTransport";
import { toAgentSkills } from "@/agent/desktopSkillAdapter";
import { buildSubAgentAgentPolicies } from "@/agent/subagentAgentPolicies";
import { filterSubAgentTools } from "@/agent/subagentToolPolicy";
import {
  buildSubAgentResearchMetadata,
  createInitialSubAgentResearchPayload,
  runSubAgentResearch,
  SUBAGENT_RESEARCH_RENDERER_KEY,
  SUBAGENT_RESEARCH_TOOL_NAME,
  type SubAgentResearchPayload,
  type SubAgentResearchTask,
  type SubAgentTaskView,
} from "@/agent/subagentResearch";
import { subAgentResearchStore } from "@/agent/subagentResearchStore";
import { Role } from "@/constants";
import type {
  ModelConfig,
  ProviderConfig,
  Skill,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from "@/types";
import { getToolRegistryAgentTools } from "@/agent/toolRegistryAgentTools";

export { SUBAGENT_RESEARCH_RENDERER_KEY, SUBAGENT_RESEARCH_TOOL_NAME };

const DEFAULT_TOOL_TIMEOUT_MS = 30000;
const MAX_TOOL_TIMEOUT_MS = 300000;
const DEFAULT_MAX_TOOL_CALL_LOOPS = 6;
const MAX_TOOL_CALL_LOOPS = 10;

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

interface SubAgentRuntimeContext {
  providerConfig?: ProviderConfig;
  modelConfig?: ModelConfig;
  skills?: Skill[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const normalizeTasks = (
  rawTasks: SubAgentToolArgs["tasks"],
): SubAgentResearchTask[] | null => {
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

const normalizePositiveInteger = (
  value: unknown,
  fallback: number,
  max: number,
) => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(max, Math.floor(numeric));
};

const buildSummary = (payload: SubAgentResearchPayload) => {
  const successful = payload.tasks.filter((task) => task.status === "success");
  const failed = payload.tasks.filter((task) => task.status === "failed");
  const cancelled = payload.tasks.filter((task) => task.status === "cancelled");
  const lines = [
    `SubAgent 调研状态：${payload.status}`,
    `完成 ${successful.length} 个，失败 ${failed.length} 个，取消 ${cancelled.length} 个。`,
    ...successful.map((task) => `- ${task.title}: ${task.answer || "无结论"}`),
  ];

  if (failed.length > 0) {
    lines.push(...failed.map((task) => `- ${task.title} 失败: ${task.error}`));
  }
  if (cancelled.length > 0) {
    lines.push(...cancelled.map((task) => `- ${task.title}: 已取消`));
  }

  return lines.join("\n");
};

const mapExecution = (
  execution: AgentToolExecutionState,
): SubAgentTaskView["toolExecutions"][number] => ({
  toolCallId: execution.toolCallId,
  toolName: execution.toolName,
  source: execution.source,
  status: execution.status,
  input: execution.input,
  output: execution.output,
  error: execution.error,
  metadata: execution.metadata,
  errorType: execution.errorType,
  timestamp: execution.timestamp,
  duration: execution.duration,
  retryCount: execution.retryCount,
});

const createSubAgent = (
  runtime: Required<
    Pick<SubAgentRuntimeContext, "providerConfig" | "modelConfig">
  > &
    Pick<SubAgentRuntimeContext, "skills">,
  maxToolCallLoops: number,
  toolTimeoutMs: number,
) =>
  new Agent({
    model: composeAgentModel({
      protocol: new DesktopModelProtocolAdapter(
        runtime.providerConfig,
        runtime.modelConfig,
      ),
      transport: new DesktopModelTransport(),
    }),
    tools: {
      getTools: () => filterSubAgentTools(getToolRegistryAgentTools()),
    },
    skills: toAgentSkills(runtime.skills || []),
    policies: buildSubAgentAgentPolicies({
      maxToolCallLoops,
      toolTimeoutMs,
    }),
  });

const resolveRuntimeContext = (
  context?: ToolExecutionContext,
): SubAgentRuntimeContext => {
  const runtime =
    isRecord(context?.toolContext) && isRecord(context.toolContext.agentRuntime)
      ? (context.toolContext.agentRuntime as SubAgentRuntimeContext)
      : {};
  return runtime;
};

export const buildSubAgentResearchMetadataFromInput = (
  toolCallId: string,
  rawInput: string,
) => {
  try {
    const parsed = rawInput.trim()
      ? (JSON.parse(rawInput) as SubAgentToolArgs)
      : {};
    const tasks = normalizeTasks(parsed.tasks) || [];
    return buildSubAgentResearchMetadata(
      createInitialSubAgentResearchPayload(toolCallId, tasks),
    );
  } catch {
    return buildSubAgentResearchMetadata(
      createInitialSubAgentResearchPayload(toolCallId, []),
    );
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
        description:
          "SubAgent 内部单次工具调用超时时间，默认 30000，最大 300000。",
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
        content:
          "参数错误：tasks 必须是非空数组，且每个任务需要唯一 id、title 和 prompt。",
        isParameterError: true,
      };
    }

    const runtime = resolveRuntimeContext(context);
    if (!runtime.providerConfig || !runtime.modelConfig) {
      return {
        content: "SubAgent 无法启动：缺少当前模型运行配置。",
        isParameterError: true,
      };
    }

    const sessionId = context?.toolCallId || `subagent-${Date.now()}`;
    const maxConcurrency = normalizePositiveInteger(
      parsed.maxConcurrency,
      3,
      5,
    );
    const maxToolCallLoops = normalizePositiveInteger(
      parsed.maxToolCallLoops,
      DEFAULT_MAX_TOOL_CALL_LOOPS,
      MAX_TOOL_CALL_LOOPS,
    );
    const toolTimeoutMs = normalizePositiveInteger(
      parsed.timeoutMs,
      DEFAULT_TOOL_TIMEOUT_MS,
      MAX_TOOL_TIMEOUT_MS,
    );

    const initialPayload = createInitialSubAgentResearchPayload(
      sessionId,
      tasks,
    );
    subAgentResearchStore.setSession(initialPayload);

    const payload = await runSubAgentResearch({
      sessionId,
      tasks,
      maxConcurrency,
      signal: context?.signal,
      onUpdate: (nextPayload) => {
        subAgentResearchStore.setSession(nextPayload);
      },
      runTask: async ({ task, signal, updateTask }) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal.addEventListener("abort", abort, { once: true });
        let answer = "";
        let reasoning = "";

        try {
          const agent = createSubAgent(
            {
              providerConfig: runtime.providerConfig!,
              modelConfig: runtime.modelConfig!,
              skills: runtime.skills,
            },
            maxToolCallLoops,
            toolTimeoutMs,
          );

          for await (const event of agent.run({
            messages: [
              {
                role: Role.System,
                content:
                  "你是独立执行任务的 SubAgent。可以使用当前可用工具完成任务；涉及危险操作时遵循工具层确认机制。输出要简明，并说明关键依据。",
              },
              {
                role: Role.User,
                content: [
                  parsed.context
                    ? `共享上下文：\n${parsed.context}\n\n任务：\n${task.prompt}`
                    : task.prompt,
                ].join(""),
              },
            ],
            enableTools: true,
            controller,
            conversationKey: context?.conversationKey
              ? `${context.conversationKey}:subagent:${task.id}`
              : undefined,
          })) {
            if (event.type === "text-delta") {
              answer = event.text;
              updateTask({
                progressText: answer,
              });
              continue;
            }

            if (event.type === "reasoning-delta") {
              reasoning = event.reasoningContent;
              updateTask({
                reasoning,
                reasoningPreview: reasoning,
              });
              continue;
            }

            if (
              event.type === "tool-call-started" ||
              event.type === "tool-call-updated" ||
              event.type === "tool-call-finished"
            ) {
              updateTask(
                {
                  toolExecutions: event.executions.map(mapExecution),
                },
                {
                  time: Date.now(),
                  type: "tool",
                  message: `调用 ${event.execution.toolName}: ${event.execution.status}`,
                },
              );
              continue;
            }

            if (event.type === "run-finished") {
              answer = event.content;
            }

            if (event.type === "run-error") {
              throw new Error(event.error.message);
            }
          }

          return {
            answer: answer || "SubAgent 未返回文本结论。",
          };
        } finally {
          signal.removeEventListener("abort", abort);
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
