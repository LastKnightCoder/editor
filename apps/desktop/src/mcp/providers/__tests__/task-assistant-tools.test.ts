import { beforeEach, describe, expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/commands/task-assistant", () => ({ taskAssistantRequest: request }));
import { executeTaskTool, taskAssistantToolsProvider } from "../task-assistant-tools";

const context = {
  databaseName: "original.db",
  toolCallId: "call",
  toolName: "create_todo",
  source: "task-assistant-tools",
};
beforeEach(() => {
  request.mockReset();
});
describe("任务工具运行协议", () => {
  it("查询与写入分别声明风险，模型不能指定数据库", () => {
    const tools = taskAssistantToolsProvider.tools();
    expect(tools.filter(tool => tool.risk === "read")).toHaveLength(3);
    expect(tools.filter(tool => tool.risk === "write")).toHaveLength(10);
    expect(tools.every(tool => !tool.parameters.properties.databaseName)).toBe(true);
  });
  it("批次保留逐项结果，绑定原库并明确部分失败", async () => {
    request.mockImplementation(async (channel, args, database) => {
      expect(database).toBe("original.db");
      if (channel === "task-assistant:preflight") return args[1];
      return args[1].requestId === "one"
        ? {
            requestId: "one",
            operationId: "saved",
            status: "succeeded",
            result: { title: "已创建" },
          }
        : {
            requestId: "two",
            status: "failed",
            error: { code: "VERSION_CONFLICT", message: "对象已变化" },
          };
    });
    const result = await executeTaskTool(
      "create_todo",
      {
        items: [
          { requestId: "one", title: "甲" },
          { requestId: "two", title: "乙" },
        ],
      },
      context
    );
    expect(JSON.parse(result.content)).toMatchObject({
      hasFailures: true,
      items: [{ status: "succeeded" }, { status: "failed" }],
    });
    expect(result.metadata?.isError).not.toBe(true);
  });
  it("全部失败进入工具错误通道", async () => {
    request.mockImplementation(async (channel, args) =>
      channel === "task-assistant:preflight"
        ? args[1]
        : { requestId: "one", status: "failed", error: { code: "READ_ONLY", message: "不可写" } }
    );
    const result = await executeTaskTool(
      "create_todo",
      { items: [{ requestId: "one", title: "甲" }] },
      context
    );
    expect(result.metadata?.isError).toBe(true);
  });
  it("取消后保留已提交回执，后续项不执行", async () => {
    const controller = new AbortController();
    request.mockImplementation(async (channel, args) => {
      if (channel === "task-assistant:preflight") return args[1];
      controller.abort();
      return { requestId: "one", operationId: "saved", status: "succeeded" };
    });
    const result = await executeTaskTool(
      "create_todo",
      {
        items: [
          { requestId: "one", title: "甲" },
          { requestId: "two", title: "乙" },
        ],
      },
      { ...context, signal: controller.signal }
    );
    expect(JSON.parse(result.content).items).toMatchObject([
      { status: "succeeded" },
      { status: "notExecuted" },
    ]);
    expect(
      request.mock.calls.filter(([channel]) => channel === "task-assistant:write")
    ).toHaveLength(1);
  });
});
