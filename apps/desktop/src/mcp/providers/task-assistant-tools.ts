import {
  TASK_READ_SCHEMAS,
  TASK_WRITE_SCHEMAS,
  TASK_TOOL_DESCRIPTIONS,
  taskToolSchema,
  validateTaskTool,
  type TaskToolName,
  type TaskBatchResult,
  type TaskOperationResult,
} from "@tau/shared/task-assistant";
import { taskAssistantRequest } from "@/commands/task-assistant";
import { bindDatabaseCommands } from "@/services/command-context";
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from "@/types";
import type { MCPProviderDefinition } from "./types";

export async function executeTaskTool(
  name: TaskToolName,
  args: Record<string, unknown>,
  context?: ToolExecutionContext
): Promise<ToolExecutionResult> {
  validateTaskTool(name, args);
  if (!context?.databaseName) throw new Error("工具缺少数据库身份，请重新发起查询");
  const commands = bindDatabaseCommands({ taskAssistantRequest }, context);
  if (name in TASK_READ_SCHEMAS) {
    const result = await commands.taskAssistantRequest<Record<string, unknown>>(
      "task-assistant:read",
      [name, args],
      context.databaseName,
      context.signal
    );
    return formatResult(result);
  }
  const inputs = await commands.taskAssistantRequest<Array<Record<string, unknown>>>(
    "task-assistant:preflight",
    [name, args.items],
    context.databaseName,
    context.signal
  );
  const batchId = crypto.randomUUID();
  const items: TaskOperationResult[] = [];
  for (const input of inputs) {
    if (context.signal?.aborted) {
      items.push({
        requestId: String(input.requestId),
        status: "notExecuted",
        error: { code: "CANCELLED", message: "操作已取消" },
      });
      continue;
    }
    try {
      items.push(
        await commands.taskAssistantRequest<TaskOperationResult>(
          "task-assistant:write",
          [name, input, batchId, context.conversationKey],
          context.databaseName,
          context.signal
        )
      );
    } catch (error) {
      items.push({
        requestId: String(input.requestId),
        status: "pending",
        error: {
          code: "RECEIPT_UNKNOWN",
          message: error instanceof Error ? error.message : "未收到执行回执，请先查询操作状态",
        },
      });
      for (const remaining of inputs.slice(items.length))
        items.push({ requestId: String(remaining.requestId), status: "notExecuted" });
      break;
    }
  }
  const result: TaskBatchResult = {
    type: "assistant-task-operation",
    databaseName: context.databaseName,
    batchId,
    items,
  };
  const failed = items.some(item => item.status === "failed");
  const committed = items.some(item => item.status === "succeeded" || item.status === "pending");
  return formatResult({ ...result, hasFailures: failed }, failed && !committed);
}

function formatResult(result: Record<string, unknown>, isError = false): ToolExecutionResult {
  let content = JSON.stringify(result);
  if (new TextEncoder().encode(content).length > 256_000) {
    // 已提交写入不能因展示超限被伪报失败；保留回执，详情通过操作查询读取。
    if (result.type === "assistant-task-operation") {
      result = {
        ...result,
        items: (result.items as TaskOperationResult[]).map(item => ({
          ...item,
          result: undefined,
        })),
      };
      content = JSON.stringify(result);
    } else throw new Error("工具结果过大，请缩小查询范围");
  }
  const compact = JSON.stringify(result, (key, value) => {
    if (key === "sourceRef" || key === "sourceTitle") return undefined;
    if (key === "recurrence" && Array.isArray(value)) return value.slice(-1);
    return value;
  });
  return {
    content,
    modelContent: [{ type: "text", text: compact }],
    metadata: { taskAssistant: result, ...(isError ? { isError: true } : {}) },
  };
}

export const taskAssistantToolsProvider: MCPProviderDefinition = {
  id: "task-assistant-tools",
  name: "待办与日程助理",
  defaultEnabled: true,
  description: "统一查询及操作独立、周期、正文待办和日程；带版本校验、批量回执及撤销。",
  tools: () =>
    [...Object.keys(TASK_READ_SCHEMAS), ...Object.keys(TASK_WRITE_SCHEMAS)].map(raw => {
      const name = raw as TaskToolName;
      return {
        name,
        description: TASK_TOOL_DESCRIPTIONS[name],
        risk: name in TASK_WRITE_SCHEMAS ? "write" : "read",
        parameters: taskToolSchema(name) as ToolDefinition["parameters"],
        executor: (args, context) => executeTaskTool(name, args, context),
      } satisfies ToolDefinition;
    }),
};
