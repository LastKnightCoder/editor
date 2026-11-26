import { resetAfterEach } from "../../../../src-electron/main/modules/collaboration/__tests__/manager-node-document.mocks";
import { afterEach, expect, it, vi } from "vitest";
import { fallbackCommandContext } from "@tau/rpc";
import { setup } from "../../../../src-electron/main/modules/collaboration/__tests__/manager-node-document.helpers";
import { createContentAgentCommands } from "../../../../src-electron/main/modules/content-runtime/agent/commands";
import { registerAgentEditExecution } from "../../../../src-electron/main/modules/agent-run-events";
import { contentEditToolsProvider } from "../content-edit-tools";
import { useContentEditReviewStore } from "@/services/content-editing/proposal-store";

const { ipc } = vi.hoisted(() => {
  const ipc = vi.fn();
  Object.defineProperty(window, "electron", {
    configurable: true,
    value: { platform: "win32", invoke: ipc, on: vi.fn(), off: vi.fn() },
  });
  return { ipc };
});
vi.mock("@/services/tool-permission/policy", () => ({
  getToolPermissionMode: () => "acceptEdits",
}));

afterEach(async () => {
  useContentEditReviewStore.setState({ proposals: {}, checkpoints: {} });
  await resetAfterEach();
});

it.each([
  { scenario: "当次恢复", lostResponses: 2 },
  { scenario: "下次编辑恢复", lostResponses: 4 },
  { scenario: "旧快照要求重读", lostResponses: 4 },
  { scenario: "原提交记录已删除", lostResponses: 4 },
  { scenario: "原提交记录已过期", lostResponses: 4 },
  { scenario: "记录暂时不可读", lostResponses: 4 },
  { scenario: "同批部分修改已确认", lostResponses: 4 },
])("$scenario 时只写一次并允许后续编辑", async ({ scenario, lostResponses }) => {
  const mixed = scenario === "同批部分修改已确认";
  const { runtime, local, localStore, event, db, server } = await setup(false, ["原文", "次段"]);
  const { documentId } = await runtime.createContent(event, 7);
  const handlers = createContentAgentCommands(() => local.agent);
  let cannotList = false;
  ipc.mockImplementation(async (channel: string, ...args: unknown[]) => {
    if (channel === "content:suggestions" && cannotList) throw new Error("读取暂不可用");
    if (channel === "module-init:init-module") return { success: true };
    if (channel === "write-cache-file") return;
    if (!(channel in handlers)) throw new Error("未知命令 " + channel);
    const last = args.at(-1);
    if (last && typeof last === "object" && "toolDatabaseName" in last) args.pop();
    return Reflect.apply(handlers[channel as keyof typeof handlers], undefined, [
      db,
      ...args,
      fallbackCommandContext,
    ]);
  });
  const transport = runtime.client.request.bind(runtime.client);
  let remaining = lostResponses;
  let firstRoute: string | undefined;
  vi.spyOn(runtime.client, "request").mockImplementation(async (...args) => {
    const result = await transport(...args);
    // 服务端已经完成事务，丢弃客户端收到的提交和回查响应。
    if (args[1].includes("/operations/")) firstRoute ??= args[1];
    if (remaining > 0 && args[1] === firstRoute) {
      remaining--;
      throw new Error("模拟丢回执");
    }
    return result;
  });
  async function call(toolName: string, args: Record<string, unknown>) {
    const tool = contentEditToolsProvider.tools().find(tool => tool.name === toolName);
    if (!tool) throw new Error("工具不存在");
    const executionId = crypto.randomUUID();
    const stop = registerAgentEditExecution(executionId);
    try {
      const result = await tool.executor(args, {
        toolName,
        toolCallId: executionId,
        toolContext: { executionId },
        source: "test",
        databaseName: "library",
        conversationKey: "library:recovery",
      });
      if (!result || typeof result === "string") throw new Error("缺少工具结果");
      return JSON.parse(result.content);
    } finally {
      stop();
    }
  }
  const read = () => call("get_content_markdown", { contentId: 7 });
  const insertion = (text: string, line: number) => ({
    op: "insert",
    text,
    locator: {
      kind: "markdown-range",
      start: { line, ch: 1 },
      end: { line, ch: 1 },
    },
  });
  const insert = (snapshotId: string, text: string, secondLine?: number) =>
    call("apply_content_edit_operations", {
      target: { contentId: 7 },
      snapshotId,
      operations: [
        insertion(text, 0),
        ...(secondLine === undefined ? [] : [insertion("丙", secondLine)]),
      ],
    });
  const original = await read();
  const secondLine = original.markdown.split("\n").indexOf("次段");
  const first = await insert(original.snapshotId, "甲", mixed ? secondLine : undefined);
  expect(first).toMatchObject({ action: lostResponses === 2 ? "applied" : "commit_pending" });
  if (mixed)
    expect(first.items.map((item: { status: string }) => item.status).sort()).toEqual([
      "accepted",
      "applying",
    ]);
  expect(remaining).toBe(0);
  const written = mixed ? 2 : 1;
  expect(server.store.operations.sequence(documentId)).toBe(written);
  const current = await read();
  const lines = (markdown: string) => markdown.trim().split(/\n+/);
  const secondary = mixed ? "次丙段" : "次段";
  expect(lines(current.markdown)).toEqual(["原甲文", secondary]);
  if (scenario === "原提交记录已删除") {
    localStore.db
      .prepare("DELETE FROM content_suggestions WHERE proposal_id=?")
      .run(first.proposalId);
    expect(await insert(current.snapshotId, "乙")).toMatchObject({
      errorCode: "SNAPSHOT_EXPIRED",
    });
    expect(await insert(current.snapshotId, "乙")).toMatchObject({
      errorCode: "SNAPSHOT_EXPIRED",
    });
  }
  if (scenario === "原提交记录已过期") {
    localStore.db
      .prepare("UPDATE content_suggestions SET status='expired' WHERE proposal_id=?")
      .run(first.proposalId);
  }
  if (scenario === "记录暂时不可读") {
    cannotList = true;
    expect(await insert(current.snapshotId, "乙")).toMatchObject({ errorCode: "COMMIT_PENDING" });
    cannotList = false;
  }
  if (scenario === "旧快照要求重读") {
    expect(await insert(original.snapshotId, "乙")).toMatchObject({
      errorCode: "SNAPSHOT_EXPIRED",
    });
  }
  expect(server.store.operations.sequence(documentId)).toBe(written);
  expect(await insert((await read()).snapshotId, "乙")).toMatchObject({ action: "applied" });
  expect(lines((await read()).markdown)).toEqual(["原乙甲文", secondary]);
  expect(server.store.operations.sequence(documentId)).toBe(written + 1);
});
