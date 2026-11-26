import { resetAfterEach } from "../../../../src-electron/main/modules/collaboration/__tests__/manager-node-document.mocks";
import { afterEach, expect, it, vi } from "vitest";
import type { ParagraphElement } from "@tau/editor/api";
import type { TableCellElement, TableElement } from "@tau/editor/extensions/table";
import type { Descendant } from "slate";
import Database from "better-sqlite3";
import * as Y from "yjs";
import { NodeTree, validateNodeDocument, type ContentNode } from "@tau/collaboration";
import { prepareContentContracts } from "@/services/editorKit";
import { getMarkdown } from "@/utils/markdown";
import { setChatDatabase } from "@/services/chatDatabase";
import { useContentEditReviewStore } from "@/services/content-editing/proposal-store";
import { must } from "../../../../src-electron/main/test-support";
import { contentEditToolsProvider } from "../content-edit-tools";
import { unregisterContentSession } from "../../../../src-electron/main/modules/collaboration/content-sessions";
import { setup } from "../../../../src-electron/main/modules/collaboration/__tests__/manager-node-document.helpers";
import { ContentDocumentTable } from "../../../../src-electron/main/modules/tables/content-document";
import { registerAgentEditExecution } from "../../../../src-electron/main/modules/agent-run-events";
import { createContentAgentCommands } from "../../../../src-electron/main/modules/content-runtime/agent/commands";

const { ipc } = vi.hoisted(() => {
  const ipc = vi.fn();
  Object.defineProperty(window, "electron", {
    configurable: true,
    value: { platform: "darwin", invoke: ipc, on: vi.fn(), off: vi.fn(), send: vi.fn() },
  });
  return { ipc };
});

afterEach(async () => {
  useContentEditReviewStore.setState({ proposals: {}, checkpoints: {} });
  await resetAfterEach();
});

const paragraph = (text: string): ParagraphElement => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});
const cell = (
  text: string,
  properties: Pick<TableCellElement, "rowSpan" | "colSpan"> = {}
): TableCellElement => ({
  type: "table-cell",
  ...properties,
  children: [{ type: "formatted", text, bold: true }],
});
const table = (last: string): TableElement => ({
  type: "table",
  align: ["center", null],
  children: [
    { type: "table-row", children: [cell("项目"), cell("说明")] },
    { type: "table-row", children: [cell("竖线 | 与\n换行", { colSpan: 2 }), cell("")] },
    { type: "table-row", children: [cell("末行"), cell(last)] },
  ],
});

async function openLibrary(nodes: Descendant[]) {
  const prepared = await (await prepareContentContracts()).createDocument(nodes);
  const fixture = await setup(false, undefined, {
    documentId: "table-deletion",
    content: prepared.content as ContentNode[],
    contracts: prepared.contracts,
  });
  setChatDatabase("library");
  const agent = fixture.local.agent;
  const handlers = createContentAgentCommands(() => agent);
  ipc.mockImplementation(async (channel: keyof typeof handlers, ...args: unknown[]) => {
    if (String(channel) === "module-init:init-module") return { success: true };
    if (String(channel) === "write-cache-file") return;
    if (!handlers[channel]) throw new Error("未知 IPC " + channel);
    return Reflect.apply(handlers[channel], undefined, [fixture.db, ...args.slice(0, -1)]);
  });
  agent.permissions.set(fixture.db, 7, "助手", "direct");
  const tools = contentEditToolsProvider.tools();
  const stop = registerAgentEditExecution("table-edits");
  const run = async (name: string, args: Record<string, unknown>) => {
    const tool = must(
      tools.find(tool => tool.name === name),
      name
    );
    const reply = await tool.executor(args, {
      toolCallId: "fixture",
      toolName: name,
      source: "test",
      databaseName: "library",
      toolContext: { executionId: "table-edits" },
    });
    if (!reply || typeof reply === "string") throw new Error("工具缺少回执");
    return JSON.parse(reply.content);
  };
  const current = async () => (await agent.readEditSnapshot(fixture.db, 7)).content;
  const find = async (queryText: string, occurrence = 1) => {
    const result = await run("find_content_ranges", {
      target: { contentId: 7 },
      queryText,
      occurrence,
    });
    expect(result.candidates, JSON.stringify(result)).toHaveLength(1);
    return {
      snapshotId: result.snapshotId,
      operations: [
        { op: "delete", locator: { kind: "match-id", matchId: result.candidates[0].matchId } },
      ],
    };
  };
  const session = () => must(fixture.localSessions.get(fixture.localId), "正文会话");
  const flush = () => fixture.local.project(session());
  const reopen = async () => {
    await flush();
    const old = session();
    unregisterContentSession(old);
    old.awareness.destroy();
    old.doc.destroy();
    fixture.localSessions.delete(fixture.localId);
    await fixture.local.open(fixture.event, { contentId: 7 });
    await validateNodeDocument(session().doc);
  };
  const diskContent = () => {
    const disk = new Database(fixture.db.name, { readonly: true });
    try {
      return ContentDocumentTable.read(disk, 7)?.content;
    } finally {
      disk.close();
    }
  };
  const userTypes = async (blockId: string, text: string) => {
    const peer = new Y.Doc({ gc: false });
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(session().doc));
    const vector = Y.encodeStateVector(peer);
    const tree = new NodeTree(peer);
    try {
      tree.insertText(blockId, 0, text, {}, tree.spans(blockId)[0]?.attributes);
      await fixture.local.acceptUpdates(
        session(),
        Y.encodeStateAsUpdate(peer, vector),
        () => undefined
      );
    } finally {
      tree.dispose();
      peer.destroy();
    }
  };
  return { fixture, run, find, current, stop, agent, reopen, flush, diskContent, userTypes };
}

it("从同文表格中删除指定整表，预览与落库一致，重开后撤销恢复原有节点", async () => {
  const same = table("相同的表");
  const lib = await openLibrary([paragraph("第九章"), same, paragraph("第十一章"), same]);
  const { fixture, run, find, current } = lib;
  try {
    const original = await current();
    const expected = original.filter(node => node.collabId !== original[3].collabId);
    const query = getMarkdown([same]).trimEnd();
    const args = await find(query, 2);
    const edit = "apply_content_edit_operations";
    const partial = await find(must(query.split("\n").at(-1), "表末行"), 2);
    for (const dryRun of [true, false])
      expect(await run(edit, { ...partial, dryRun })).toMatchObject({
        success: false,
        errorCode: "UNSUPPORTED_RANGE",
      });
    const preview = await run(edit, { ...args, dryRun: true });
    expect(preview, JSON.stringify(preview)).toMatchObject({
      success: true,
      markdown: getMarkdown(expected as Descendant[]),
    });
    expect(await current()).toEqual(original);
    expect(lib.agent.suggestions.list(fixture.db, {})).toEqual([]);
    const applied = await run(edit, args);
    expect(applied, JSON.stringify(applied)).toMatchObject({ action: "applied" });
    expect(await current()).toEqual(expected);
    await lib.flush();
    expect(lib.diskContent()).toEqual(expected);
    await lib.reopen();
    expect(await current()).toEqual(expected);
    const [item] = lib.agent.suggestions.list(fixture.db, { proposalId: applied.proposalId });
    expect(await lib.agent.suggestions.undo(fixture.db, 7, [item.id])).toMatchObject([
      { status: "undone" },
    ]);
    await lib.reopen();
    expect(await current()).toEqual(original);
    expect(lib.diskContent()).toEqual(original);
  } finally {
    lib.stop();
  }
});

it("正文仅有一张表时，删空和撤销都能重开", async () => {
  const only = table("唯一");
  const lib = await openLibrary([only]);
  try {
    const before = await lib.current();
    const args = await lib.find(getMarkdown([only]).trimEnd());
    const edit = "apply_content_edit_operations";
    expect(await lib.run(edit, { ...args, dryRun: true })).toMatchObject({
      success: true,
      markdown: "",
    });
    const result = await lib.run(edit, args);
    expect(result).toMatchObject({ action: "applied" });
    await lib.reopen();
    expect(await lib.current()).toEqual([]);
    expect(lib.diskContent()).toEqual([]);
    const [item] = lib.agent.suggestions.list(lib.fixture.db, { proposalId: result.proposalId });
    expect(await lib.agent.suggestions.undo(lib.fixture.db, 7, [item.id])).toMatchObject([
      { status: "undone" },
    ]);
    await lib.reopen();
    expect(await lib.current()).toEqual(before);
  } finally {
    lib.stop();
  }
});

it.each([
  ["可撤销", 12000, true],
  ["超出容量", 25000, false],
] as const)("大表%s时预览与写入一致", async (_label, count, fits) => {
  const large = table("甲".repeat(count));
  const lib = await openLibrary([large, paragraph("保留")]);
  try {
    const before = await lib.current();
    const args = await lib.find(getMarkdown([large]).trimEnd());
    const edit = "apply_content_edit_operations";
    const preview = await lib.run(edit, { ...args, dryRun: true });
    const result = await lib.run(edit, args);
    if (fits) {
      expect(preview).toMatchObject({ success: true });
      expect(result).toMatchObject({ action: "applied" });
      await lib.reopen();
      expect(await lib.current()).toEqual(before.slice(1));
      const [item] = lib.agent.suggestions.list(lib.fixture.db, { proposalId: result.proposalId });
      expect(await lib.agent.suggestions.undo(lib.fixture.db, 7, [item.id])).toMatchObject([
        { status: "undone" },
      ]);
    } else {
      for (const value of [preview, result])
        expect(value).toMatchObject({ success: false, errorCode: "UNDO_LIMIT" });
    }
    await lib.reopen();
    expect(lib.diskContent()).toEqual(before);
    expect(await lib.current()).toEqual(before);
  } finally {
    lib.stop();
  }
});

it("共享服务按原节点身份删除并撤销；旧服务不接收复合块删除", async () => {
  const large = table("共享目标");
  const lib = await openLibrary([paragraph("章节"), large, paragraph("正文")]);
  const { fixture } = lib;
  try {
    const { documentId } = await fixture.runtime.createContent(fixture.event, 7);
    const original = await lib.current();
    const args = await lib.find(getMarkdown([large]).trimEnd());
    const client = fixture.runtime.client;
    const transport = client.request.bind(client);
    const old = vi.spyOn(client, "request").mockImplementation(async (...args) => {
      const result = await transport(...args);
      return args[1].endsWith("/protocol") ? {} : result;
    });
    const edit = "apply_content_edit_operations";
    const rejected = await lib.run(edit, args);
    expect(rejected.items).toMatchObject([{ status: "expired" }]);
    expect(fixture.server.store.operations.sequence(documentId)).toBe(0);
    expect(await lib.current()).toEqual(original);
    old.mockRestore();
    const result = await lib.run(edit, args);
    expect(result, JSON.stringify(result)).toMatchObject({ action: "applied" });
    expect(await lib.current()).toEqual([original[0], original[2]]);
    const [item] = lib.agent.suggestions.list(fixture.db, { proposalId: result.proposalId });
    expect(await lib.agent.suggestions.undo(fixture.db, 7, [item.id])).toMatchObject([
      { status: "undone" },
    ]);
    expect(await lib.current()).toEqual(original);
    expect(fixture.server.store.operations.sequence(documentId)).toBe(2);
    await fixture.runtime.content.project(
      must(fixture.runtime.content.sessions.get(documentId), "共享会话")
    );
  } finally {
    lib.stop();
  }
});

const seeds = Array.from({ length: 100 }, (_, index) => index + 1);
it.runIf(process.env.TAU_TABLE_DELETE_STRESS === "1").each(seeds)(
  "表格编辑随机序列 seed=%i",
  async seed => {
    let state = Math.imul(seed, 0x9e3779b1) >>> 0;
    const random = (max: number) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return Math.floor((state / 0x100000000) * max);
    };
    const same = table(["🙂", "e\u0301", "空 | 格", ""][random(4)]);
    const rows = random(5);
    for (let row = 0; row < rows; row++)
      same.children.push({ type: "table-row", children: [cell(""), cell("第" + row + "行")] });
    if (random(2))
      same.children.push(
        { type: "table-row", children: [cell("跨行", { rowSpan: 2 }), cell("甲")] },
        { type: "table-row", children: [cell(""), cell("乙")] }
      );
    const middle = paragraph("中间的段落");
    const lib = await openLibrary([same, middle, structuredClone(same)]);
    const edit = "apply_content_edit_operations";
    const expected = await lib.current();
    let lastAction = "起始";
    try {
      for (let cycle = 0; cycle < 10; cycle++) {
        const targetIndex = random(2) * 2;
        const target = expected[targetIndex];
        const query = getMarkdown([target] as Descendant[]).trimEnd();
        const occurrence =
          targetIndex === 2 && getMarkdown([expected[0]] as Descendant[]).trimEnd() === query
            ? 2
            : 1;
        const args = await lib.find(query, occurrence);
        const retained = () => expected.filter(node => node.collabId !== target.collabId);
        lastAction = cycle + " 预览";
        expect(await lib.run(edit, { ...args, dryRun: true })).toMatchObject({
          success: true,
          markdown: getMarkdown(retained() as Descendant[]),
        });
        expect(await lib.current()).toEqual(expected);
        lastAction = cycle + " 不完整的表格行";
        const partial = await lib.find(must(query.split("\n").at(-1), "表末行"));
        expect(await lib.run(edit, { ...partial, dryRun: random(2) === 0 })).toMatchObject({
          success: false,
          errorCode: "UNSUPPORTED_RANGE",
        });
        lastAction = cycle + " 并发输入";
        const conflict = random(4) === 0;
        const block = conflict
          ? must(target.children?.[0].children?.[0], "表头单元格")
          : expected[1];
        await lib.userTypes(String(block.collabId), "新");
        const inputLeaf = must(block.children?.[0], "并发输入位置");
        inputLeaf.text = "新" + inputLeaf.text;
        expect(await lib.current()).toEqual(expected);
        lastAction = cycle + " 提交";
        let result = await lib.run(edit, args);
        if (conflict) {
          expect(result.items, JSON.stringify(result)).toMatchObject([{ status: "expired" }]);
          expect(await lib.current()).toEqual(expected);
          await lib.reopen();
          expect(lib.diskContent()).toEqual(expected);
          const refreshed = getMarkdown([target] as Descendant[]).trimEnd();
          const which =
            targetIndex === 2 && getMarkdown([expected[0]] as Descendant[]).trimEnd() === refreshed
              ? 2
              : 1;
          result = await lib.run(edit, await lib.find(refreshed, which));
        }
        expect(result).toMatchObject({ action: "applied" });
        const [item] = lib.agent.suggestions.list(lib.fixture.db, {
          proposalId: result.proposalId,
        });
        expect(await lib.current()).toEqual(retained());
        lastAction = cycle + " 重试同一提交";
        await lib.agent.suggestions.accept(lib.fixture.db, 7, [item.id]);
        expect(await lib.current()).toEqual(retained());
        lastAction = cycle + " 重开";
        await lib.reopen();
        expect(await lib.current()).toEqual(retained());
        expect(lib.diskContent()).toEqual(retained());
        lastAction = cycle + " 撤销前输入";
        await lib.userTypes(String(expected[1].collabId), "续");
        const middleLeaf = must(expected[1].children?.[0], "段落文字");
        middleLeaf.text = "续" + middleLeaf.text;
        lastAction = cycle + " 撤销与重试";
        expect(await lib.agent.suggestions.undo(lib.fixture.db, 7, [item.id])).toMatchObject([
          { status: "undone" },
        ]);
        await lib.agent.suggestions.undo(lib.fixture.db, 7, [item.id]);
        lastAction = cycle + " 撤销后重开";
        await lib.reopen();
        expect(await lib.current()).toEqual(expected);
        expect(lib.diskContent()).toEqual(expected);
      }
    } catch (cause) {
      throw new Error("seed=" + seed + "，" + lastAction, { cause });
    } finally {
      lib.stop();
    }
  },
  120000
);
