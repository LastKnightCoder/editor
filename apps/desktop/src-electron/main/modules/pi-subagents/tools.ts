import type { AgentToolResult, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { SubagentSession } from "@/types/subagent";
import { SUBAGENT_RENDERER_KEY } from "@/types/subagent";
import type { SubagentService } from "./service";
import { SUBAGENT_TOOL_CATALOG, type SubagentToolName } from "@/agent/subagentToolCatalog";

const definition = (name: SubagentToolName) => {
  const { label, description, parameters } = SUBAGENT_TOOL_CATALOG[name];
  return {
    name,
    label,
    description,
    parameters: parameters as ToolDefinition["parameters"],
  };
};
const result = (value: unknown): AgentToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  details: {
    render: {
      rendererKey: SUBAGENT_RENDERER_KEY,
      payload: JSON.parse(JSON.stringify(value)),
    },
  },
});
const requiredText = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error("参数必须是非空文本");
  return value.trim();
};

export function createSubagentTools(
  service: SubagentService,
  hostId: string,
  child?: SubagentSession
): ToolDefinition[] {
  if (child)
    return [
      {
        ...definition("send_parent"),
        execute: async (toolCallId, params, signal) => {
          signal?.throwIfAborted();
          service.progress(
            child,
            requiredText((params as { message: unknown }).message),
            toolCallId
          );
          return {
            content: [{ type: "text", text: "消息已提交" }],
            details: {},
          };
        },
      },
    ];

  return [
    ...(["spawn_agent", "send_agent"] as const).map(name => ({
      ...definition(name),
      execute: async (
        toolCallId: string,
        raw: unknown,
        signal?: AbortSignal,
        onUpdate?: (partial: AgentToolResult) => void
      ) => {
        signal?.throwIfAborted();
        const input = raw as {
          agentId?: string;
          title?: string;
          message: unknown;
          mode: "sync" | "async";
        };
        if (input.mode !== "sync" && input.mode !== "async")
          throw new Error("mode 必须是 sync 或 async");
        const parent = service.attach(hostId);
        const requestKey = `${parent.branchId ?? "root"}:${toolCallId}`;
        const run = service.submit(hostId, requestKey, {
          ...(name === "spawn_agent"
            ? { title: requiredText(input.title) }
            : { agentId: requiredText(input.agentId) }),
          message: requiredText(input.message),
          mode: input.mode,
        });
        const identity = {
          agentId: run.agentId,
          runId: run.runId,
          status: run.status,
        };
        if (input.mode === "async") return result(identity);
        // 同步等待期间先发布身份，界面才能在结果回来前展示子 Agent 的实时状态。
        onUpdate?.(result(identity));
        return result(await service.wait(run, toolCallId, signal));
      },
    })),
    {
      ...definition("wait_agent"),
      execute: async (toolCallId, raw, signal) => {
        const input = raw as {
          agentId: unknown;
          runId?: string;
          timeoutMs?: number;
        };
        const run = service.resolveRun(hostId, requiredText(input.agentId), input.runId);
        const timeout = input.timeoutMs ?? 30000;
        if (!Number.isInteger(timeout) || timeout < 0 || timeout > 300000)
          throw new Error("timeoutMs 必须是 0–300000 的整数");
        return result(await service.wait(run, toolCallId, signal, timeout));
      },
    },
    {
      ...definition("cancel_agent"),
      execute: async (_toolCallId, raw) => {
        const input = raw as { agentId: unknown; runId: unknown };
        const run = service.resolveRun(
          hostId,
          requiredText(input.agentId),
          requiredText(input.runId)
        );
        await service.cancel(run);
        const current = service.resolveRun(hostId, run.agentId, run.runId);
        return result({
          agentId: run.agentId,
          runId: run.runId,
          status: current.status,
        });
      },
    },
  ];
}
