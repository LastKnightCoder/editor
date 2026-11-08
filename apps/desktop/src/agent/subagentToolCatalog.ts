import type { ToolJsonSchema } from "@/types/tool";
import type { SUBAGENT_TOOL_NAMES } from "@/types/subagent";

export type SubagentToolName = (typeof SUBAGENT_TOOL_NAMES)[number];

interface SubagentToolInfo {
  label: string;
  description: string;
  audience: "parent" | "child";
  parameters: ToolJsonSchema;
}

const textField = { type: "string", minLength: 1 };
const modeField = {
  type: "string",
  enum: ["sync", "async"],
  description: "sync 等待结果；async 立即返回 agentId 和 runId。",
};
const schema = (properties: ToolJsonSchema["properties"], required: string[]): ToolJsonSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

/** 宿主工具与 MCP 展示共用的定义，不包含执行器或平台依赖。 */
export const SUBAGENT_TOOL_CATALOG: Record<SubagentToolName, SubagentToolInfo> = {
  spawn_agent: {
    label: "创建子 Agent",
    description: "创建有独立上下文的子 Agent。可同步等待或异步返回身份；子 Agent 不能继续派发。",
    audience: "parent",
    parameters: schema({ title: textField, message: textField, mode: modeField }, [
      "title",
      "message",
      "mode",
    ]),
  },
  send_agent: {
    label: "继续子 Agent",
    description:
      "向自己创建的子 Agent 发送新任务或继续消息，复用其历史；忙时排队。失败是否继续由你决定。",
    audience: "parent",
    parameters: schema({ agentId: textField, message: textField, mode: modeField }, [
      "agentId",
      "message",
      "mode",
    ]),
  },
  wait_agent: {
    label: "等待子 Agent",
    description:
      "等待自己的子 Agent 执行结束。省略 runId 时固定等待最新执行；超时仅结束等待，不取消任务。用户提问与审批只由 UI 处理。",
    audience: "parent",
    parameters: schema(
      {
        agentId: textField,
        runId: textField,
        timeoutMs: { type: "integer", minimum: 0, maximum: 300000 },
      },
      ["agentId"]
    ),
  },
  cancel_agent: {
    label: "取消子 Agent 执行",
    description: "取消指定的一次执行，保留子 Agent 会话和历史以供再次使用。",
    audience: "parent",
    parameters: schema({ agentId: textField, runId: textField }, ["agentId", "runId"]),
  },
  send_parent: {
    label: "向父 Agent 报告",
    description: "向父 Agent 发送任务进度或发现。最终结果与失败由运行时自动上报。",
    audience: "child",
    parameters: schema({ message: textField }, ["message"]),
  },
};
