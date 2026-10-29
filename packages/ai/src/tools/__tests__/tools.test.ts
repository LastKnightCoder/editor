import { describe, expect, it, vi } from "vitest";
import type { AiToolExecutionContext, AiToolSpec } from "../../contracts";
import { AiToolRegistry, requiresToolApproval, type AiToolApprovalChoice } from "../index";

const spec = (risk: AiToolSpec["risk"] = "read"): AiToolSpec => ({
  id: "cards:read",
  name: "read_card",
  description: "读取卡片",
  inputSchema: {
    type: "object",
    properties: { id: { type: "integer", minimum: 1 } },
    required: ["id"],
    additionalProperties: false,
  },
  risk,
  sourceId: "cards",
  executionIdentity: "cards:1",
});
const context = (signal = new AbortController().signal): AiToolExecutionContext => ({
  session: { databaseName: "test.db", sessionId: "session-1" },
  runId: "run-1",
  executionId: crypto.randomUUID(),
  toolCallId: "call-1",
  operationId: "operation-1",
  signal,
});

describe("工具权限与注册快照", () => {
  it("风险缺省为执行，权限模式与桌面一致", () => {
    expect(requiresToolApproval(undefined, "manual")).toBe(true);
    expect(requiresToolApproval("read", "manual")).toBe(false);
    expect(requiresToolApproval("write", "acceptEdits")).toBe(false);
    expect(requiresToolApproval("execute", "acceptEdits")).toBe(true);
    expect(requiresToolApproval("execute", "bypass")).toBe(false);
  });

  it("快照捕获定义与执行器，原对象修改不改变已注册工具", async () => {
    const registry = new AiToolRegistry();
    const definition = spec();
    const execute = vi.fn(async () => ({ content: "卡片正文" }));
    registry.register(definition, execute);
    definition.inputSchema.required = ["changed"];
    const snapshot = registry.capture([definition.id]);
    expect(
      await snapshot.execute(definition.id, { id: 1 }, context(), { interactionMode: "none" })
    ).toEqual({ content: "卡片正文" });
    expect(execute).toHaveBeenCalledOnce();
    await expect(
      snapshot.execute(definition.id, { id: "invalid" }, context(), { interactionMode: "none" })
    ).rejects.toMatchObject({ code: "AI_TOOL_ARGUMENT_INVALID" });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("没有交互承载时拒绝写工具，不等待也不执行", async () => {
    const registry = new AiToolRegistry();
    const execute = vi.fn(async () => ({ content: "不应执行" }));
    registry.register(spec("write"), execute);
    await expect(
      registry
        .capture(["cards:read"])
        .execute("cards:read", { id: 1 }, context(), { interactionMode: "none" })
    ).rejects.toMatchObject({ code: "AI_INTERACTION_UNAVAILABLE" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("会话授权绑定原注册，其他会话和重注册仍需确认", async () => {
    const registry = new AiToolRegistry();
    const execute = vi.fn(async () => ({ content: "完成" }));
    const dispose = registry.register(spec("write"), execute);
    const approve = vi.fn(async (): Promise<AiToolApprovalChoice> => "allow-session");
    const options = { interactionMode: "host" as const, approve };
    await registry.capture(["cards:read"]).execute("cards:read", { id: 1 }, context(), options);
    await registry.capture(["cards:read"]).execute("cards:read", { id: 1 }, context(), options);
    expect(approve).toHaveBeenCalledTimes(1);
    const other = context();
    other.session.sessionId = "another";
    await registry.capture(["cards:read"]).execute("cards:read", { id: 1 }, other, options);
    expect(approve).toHaveBeenCalledTimes(2);
    dispose();
    registry.register(spec("write"), execute);
    await registry.capture(["cards:read"]).execute("cards:read", { id: 1 }, context(), options);
    expect(approve).toHaveBeenCalledTimes(3);
  });

  it("等待审批时来源停用立即终止，迟到的同意不能执行", async () => {
    const registry = new AiToolRegistry();
    const execute = vi.fn(async () => ({ content: "不应执行" }));
    const dispose = registry.register(spec("write"), execute);
    let approve!: (choice: AiToolApprovalChoice) => void;
    const run = registry.capture(["cards:read"]).execute("cards:read", { id: 1 }, context(), {
      interactionMode: "host",
      approve: () =>
        new Promise(resolve => {
          approve = resolve;
        }),
    });
    const failure = expect(run).rejects.toMatchObject({ code: "AI_TOOL_UNAVAILABLE" });
    dispose();
    await failure;
    approve("allow");
    expect(execute).not.toHaveBeenCalled();
  });

  it("已开始的写入中断时报告结果未知，不声称没有写入", async () => {
    const registry = new AiToolRegistry();
    const controller = new AbortController();
    let finish!: (value: { content: string }) => void;
    let toolSignal: AbortSignal | undefined;
    registry.register(spec("write"), async (_args, ctx) => {
      toolSignal = ctx.signal;
      return new Promise(resolve => {
        finish = resolve;
      });
    });
    const run = registry
      .capture(["cards:read"])
      .execute("cards:read", { id: 1 }, context(controller.signal), {
        interactionMode: "none",
        permissionMode: "acceptEdits",
      });
    const failure = expect(run).rejects.toMatchObject({ code: "AI_TOOL_OUTCOME_UNKNOWN" });
    controller.abort();
    await failure;
    expect(toolSignal?.aborted).toBe(true);
    finish({ content: "迟到结果" });
  });

  it("停用后旧快照失效，同名新来源不能被旧快照认领", async () => {
    const registry = new AiToolRegistry();
    const dispose = registry.register(spec(), async () => ({ content: "旧来源" }));
    const snapshot = registry.capture(["cards:read"]);
    dispose();
    const replacement = vi.fn(async () => ({ content: "新来源" }));
    registry.register({ ...spec(), executionIdentity: "cards:2" }, replacement);
    expect(snapshot.isCurrent()).toBe(false);
    await expect(
      snapshot.execute("cards:read", { id: 1 }, context(), { interactionMode: "none" })
    ).rejects.toMatchObject({ code: "AI_TOOL_UNAVAILABLE" });
    expect(replacement).not.toHaveBeenCalled();
  });
});
