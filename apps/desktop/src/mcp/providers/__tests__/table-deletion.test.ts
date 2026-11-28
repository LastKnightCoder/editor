import { resetAfterEach } from "../../../../src-electron/main/modules/collaboration/__tests__/manager-node-document.mocks";
import { openContentToolHost } from "./content-edit-tool-host";
import { afterEach, expect, it, vi } from "vitest";
import type { ParagraphElement } from "@tau/editor/api";
import type { TableCellElement, TableElement } from "@tau/editor/extensions/table";
import type { Descendant } from "slate";
import { desktopMarkdown, getMarkdown } from "@/utils/markdown";
import { decodeTauMarkdown } from "@tau/markdown";
import { readNodeDocument } from "@tau/collaboration";
import { useContentEditReviewStore } from "@/services/content-editing/proposal-store";
import { must } from "../../../../src-electron/main/test-support";

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

const openLibrary = (nodes: Descendant[]) => openContentToolHost(nodes, ipc);

it("从同文表格中删除指定整表，预览与落库一致，重开后撤销恢复原有节点", async () => {
  const same = table("相同的表");
  const lib = await openLibrary([paragraph("第九章"), same, paragraph("第十一章"), same]);
  const { fixture, run, find, current } = lib;
  try {
    const original = await current();
    const expected = original.filter(node => node.collabId !== original[3].collabId);
    const query = await lib.blockSource(original[3]);
    const args = await find(query);
    const edit = "apply_content_edit_operations";
    const partial = await find('"colSpan":2', 2);
    for (const dryRun of [true, false])
      expect(await run(edit, { ...partial, dryRun })).toMatchObject({
        success: false,
        errorCode: "INVALID_NATIVE_MARKDOWN",
      });
    const preview = await run(edit, { ...args, dryRun: true });
    expect(preview, JSON.stringify(preview)).toMatchObject({
      success: true,
    });
    expect(decodeTauMarkdown(preview.markdown, { processor: desktopMarkdown }).content).toEqual(
      expected
    );
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
    const args = await lib.find(await lib.blockSource(before[0]));
    const edit = "apply_content_edit_operations";
    const preview = await lib.run(edit, { ...args, dryRun: true });
    expect(preview).toMatchObject({ success: true });
    expect(decodeTauMarkdown(preview.markdown, { processor: desktopMarkdown }).content).toEqual([]);
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
    const args = await lib.find(await lib.blockSource(before[0]));
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
    const args = await lib.find(await lib.blockSource(original[1]));
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

it("共享原生改色须协商身份复用能力，提交和撤销保留所有节点", async () => {
  const colored = table("共享颜色");
  colored.children[1].color = "blue";
  const lib = await openContentToolHost([paragraph("共享正文"), colored], ipc, {}, true);
  try {
    const { fixture } = lib;
    const { documentId } = await fixture.runtime.createContent(fixture.event, 7);
    const original = await lib.current();
    const expected = structuredClone(original);
    must(expected[1].children?.[1], "目标行").color = "red";
    const target = await lib.find('"color":"blue"');
    const args = {
      ...target,
      operations: target.operations.map(operation => ({
        ...operation,
        op: "replace",
        text: '"color":"red"',
      })),
    };
    const client = fixture.runtime.client;
    const transport = client.request.bind(client);
    const old = vi.spyOn(client, "request").mockImplementation(async (...args) => {
      const result = await transport(...args);
      return args[1].endsWith("/protocol") ? { scopedSubtreeDeletion: true } : result;
    });
    expect((await lib.run("apply_content_edit_operations", args)).items).toMatchObject([
      { status: "expired" },
    ]);
    expect(fixture.server.store.operations.sequence(documentId)).toBe(0);
    expect(await lib.current()).toEqual(original);
    old.mockRestore();
    const result = await lib.run("apply_content_edit_operations", args);
    expect(result, JSON.stringify(result)).toMatchObject({ action: "applied" });
    expect(await lib.current()).toEqual(expected);
    const shared = must(fixture.runtime.content.sessions.get(documentId), "共享会话");
    const project = async (content: typeof original) => {
      await vi.waitFor(() => expect(readNodeDocument(shared.doc).content).toEqual(content), {
        timeout: 5000,
      });
      await fixture.runtime.content.project(shared);
    };
    await project(expected);
    expect(lib.diskContent()).toEqual(expected);
    const [item] = lib.agent.suggestions.list(fixture.db, { proposalId: result.proposalId });
    expect(await lib.agent.suggestions.undo(fixture.db, 7, [item.id])).toMatchObject([
      { status: "undone" },
    ]);
    await project(original);
    expect(await lib.current()).toEqual(original);
    expect(lib.diskContent()).toEqual(original);
    expect(fixture.server.store.operations.sequence(documentId)).toBe(2);
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
        const query = await lib.blockSource(target);
        const args = await lib.find(query);
        const retained = () => expected.filter(node => node.collabId !== target.collabId);
        lastAction = cycle + " 预览";
        const preview = await lib.run(edit, { ...args, dryRun: true });
        expect(preview).toMatchObject({ success: true });
        expect(decodeTauMarkdown(preview.markdown, { processor: desktopMarkdown }).content).toEqual(
          retained()
        );
        expect(await lib.current()).toEqual(expected);
        lastAction = cycle + " 不完整的表格行";
        const partial = await lib.find('"colSpan":2');
        expect(await lib.run(edit, { ...partial, dryRun: random(2) === 0 })).toMatchObject({
          success: false,
          errorCode: "INVALID_NATIVE_MARKDOWN",
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
          const refreshed = await lib.blockSource(target);
          result = await lib.run(edit, await lib.find(refreshed));
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

it("通过原生 Markdown 改色后保存、重开和撤销均保留完整表格与身份", async () => {
  const colored = table("颜色验证");
  colored.children[1].color = "blue";
  colored.children[2].color = "green";
  Object.assign(colored, { future: { retained: true } });
  const lib = await openLibrary([paragraph("前文"), colored, paragraph("后文")]);
  try {
    const original = await lib.current();
    const read = await lib.run("get_content_markdown", { contentId: 7 });
    expect(read.format).toBe("tau-markdown/1");
    expect(decodeTauMarkdown(read.markdown, { processor: desktopMarkdown }).content).toEqual(
      original
    );
    const expected = structuredClone(original);
    const row = expected[1].children?.[1];
    if (!row) throw new Error("目标行不存在");
    row.color = "red";
    const target = await lib.find('"color":"blue"');
    target.operations = target.operations.map(operation => ({
      ...operation,
      op: "replace",
      text: '"color":"red"',
    }));
    const preview = await lib.run("apply_content_edit_operations", { ...target, dryRun: true });
    expect(preview.success, JSON.stringify(preview)).toBe(true);
    expect(decodeTauMarkdown(preview.markdown, { processor: desktopMarkdown }).content).toEqual(
      expected
    );
    expect(await lib.current()).toEqual(original);
    const result = await lib.run("apply_content_edit_operations", target);
    expect(result, JSON.stringify(result)).toMatchObject({ action: "applied" });
    await lib.reopen();
    expect(await lib.current()).toEqual(expected);
    expect(lib.diskContent()).toEqual(expected);
    const [item] = lib.agent.suggestions.list(lib.fixture.db, { proposalId: result.proposalId });
    expect(await lib.agent.suggestions.undo(lib.fixture.db, 7, [item.id])).toMatchObject([
      { status: "undone" },
    ]);
    await lib.reopen();
    expect(await lib.current()).toEqual(original);
    expect(lib.diskContent()).toEqual(original);
    const rejected = await lib.run("apply_content_edit_operations", {
      target: { contentId: 7 },
      snapshotId: (await lib.run("get_content_markdown", { contentId: 7 })).snapshotId,
      operations: [
        { op: "replace", locator: { kind: "full-document" }, text: getMarkdown([colored]) },
      ],
    });
    expect(rejected).toMatchObject({ success: false, errorCode: "FORMAT_REQUIRED" });
    expect(await lib.current()).toEqual(original);
  } finally {
    lib.stop();
  }
});

it("原生全文重写保留颜色、合并、未知属性和节点身份", async () => {
  const colored = table("整篇验证");
  colored.children[1].color = "blue";
  Object.assign(colored.children[1], { future: { keep: "row-data" } });
  const lib = await openLibrary([paragraph("前文"), colored, paragraph("后文")]);
  try {
    const original = await lib.current();
    const expected = structuredClone(original);
    const row = expected[1].children?.[1];
    if (!row) throw new Error("目标行不存在");
    row.color = "red";
    const read = await lib.run("get_content_markdown", { contentId: 7 });
    const result = await lib.run("apply_content_edit_operations", {
      target: { contentId: 7 },
      snapshotId: read.snapshotId,
      operations: [
        {
          op: "replace",
          locator: { kind: "full-document" },
          text: read.markdown.replace('"color":"blue"', '"color":"red"'),
        },
      ],
    });
    expect(result, JSON.stringify(result)).toMatchObject({ action: "applied" });
    await lib.reopen();
    expect(await lib.current()).toEqual(expected);
    expect(lib.diskContent()).toEqual(expected);
  } finally {
    lib.stop();
  }
});

it("按稳定行 ID 重排时无需行号，保留属性与所有节点身份", async () => {
  const colored = table("重排验证");
  colored.children[1].color = "blue";
  colored.children[2].color = "green";
  const lib = await openLibrary([paragraph("前文"), colored, paragraph("后文")]);
  try {
    const original = await lib.current();
    const rows = must(original[1].children, "表格行");
    const first = rows[1],
      second = rows[2];
    const a = await lib.blockSource(first),
      b = await lib.blockSource(second);
    const read = await lib.run("get_content_markdown", { contentId: 7 });
    expect(read.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ blockId: original[1].collabId, path: [1], type: "table" }),
      ])
    );
    const result = await lib.run("apply_content_edit_operations", {
      target: { contentId: 7 },
      snapshotId: read.snapshotId,
      operations: [
        { op: "replace", locator: { kind: "block-id", blockId: first.collabId }, text: b },
        { op: "replace", locator: { kind: "block-id", blockId: second.collabId }, text: a },
      ],
    });
    expect(result, JSON.stringify(result)).toMatchObject({ action: "applied" });
    const expected = structuredClone(original);
    const expectedRows = must(expected[1].children, "预期行");
    [expectedRows[1], expectedRows[2]] = [expectedRows[2], expectedRows[1]];
    await lib.reopen();
    expect(await lib.current()).toEqual(expected);
    expect(lib.diskContent()).toEqual(expected);
  } finally {
    lib.stop();
  }
});

it("在读取到的同一快照内查找与编辑，拒绝跨资料库的快照", async () => {
  const colored = table("快照验证");
  colored.children[1].color = "blue";
  const lib = await openLibrary([colored]);
  try {
    const read = await lib.run("get_content_markdown", { contentId: 7 });
    const found = await lib.run("find_content_ranges", {
      snapshotId: read.snapshotId,
      queryText: '"color":"blue"',
    });
    expect(found, JSON.stringify(found)).toMatchObject({
      success: true,
      snapshotId: read.snapshotId,
    });
    expect(
      await lib.run(
        "find_content_ranges",
        { snapshotId: read.snapshotId, queryText: '"color":"blue"' },
        "other-library"
      )
    ).toMatchObject({ success: false, errorCode: "SNAPSHOT_EXPIRED" });
    const match = must(found.candidates[0], "原文匹配");
    const result = await lib.run("apply_content_edit_operations", {
      target: { contentId: 7 },
      snapshotId: read.snapshotId,
      operations: [
        {
          op: "replace",
          locator: { kind: "match-id", matchId: match.matchId },
          text: '"color":"red"',
        },
      ],
    });
    expect(result).toMatchObject({ action: "applied" });
    await lib.reopen();
    expect((await lib.current())[0].children?.[1].color).toBe("red");
  } finally {
    lib.stop();
  }
});
