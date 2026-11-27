// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { must } from "../../../test-support";
import Database from "better-sqlite3";
import * as Y from "yjs";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { WhiteboardModel, WHITEBOARD_LIMITS } from "@tau/collaboration";
import { ContentIdentityTable } from "../../tables/content-identity";
import { WhiteboardJournal } from "../journal";
import { WhiteboardDocumentSessions } from "../sessions";
import {
  mindErrorDetails,
  mindIndex,
  mindPreconditions,
} from "../../../../../shared/whiteboard-mindmap";
import { mindmapAgentTools } from "@/services/whiteboard-documents/mindmap-tools";
import type { AgentBoardRequest } from "../../../../../shared/whiteboard-agent";

const cleanups: (() => void)[] = [];
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach(close => close())
);
const labels = (nodes: readonly { text?: string; children?: readonly unknown[] }[]): string =>
  nodes
    .map(node =>
      typeof node.text === "string"
        ? node.text
        : labels((node.children ?? []) as Parameters<typeof labels>[0])
    )
    .join("");

async function fixture() {
  const db = new Database(":memory:");
  db.exec(schema);
  ContentIdentityTable.establishBaseline(db);
  const journal = new WhiteboardJournal(":memory:");
  const sessions = new WhiteboardDocumentSessions(
    journal,
    () => db,
    () => undefined,
    () => undefined
  );
  const seed = new WhiteboardModel(new Y.Doc({ gc: false }));
  const [pageId] = seed.submit([{ type: "create_page", title: "导图" }], null).createdIds;
  const created = await sessions.create(
    "mindmap-test",
    "seed",
    Y.encodeStateAsUpdate(seed.doc),
    "board"
  );
  const view = await sessions.open("mindmap-test", created.contentIds[0], 1, "test");
  cleanups.push(() => {
    sessions.dispose();
    journal.close();
    db.close();
    seed.dispose();
    seed.doc.destroy();
  });
  const model = () => {
    const doc = new Y.Doc({ gc: false });
    Y.applyUpdate(doc, sessions.snapshot(view.leaseId, 1).state);
    const value = new WhiteboardModel(doc);
    cleanups.push(() => {
      value.dispose();
      doc.destroy();
    });
    return value;
  };
  const page = () => model().read().pages[0];
  let sequence = 0;
  let loseReply = false;
  const request = async (operations: Record<string, unknown>[]): Promise<AgentBoardRequest> => ({
    domain: "mindmap",
    owner: "main-chat:mindmap",
    requestId: `request-${++sequence}`,
    pageId,
    preconditions: await mindPreconditions(page(), [...mindIndex(page()).nodes.keys()]),
    operations,
  });
  const apply = (request: AgentBoardRequest) => sessions.applyAgent(view.leaseId, 1, request);
  const write = async (operations: Record<string, unknown>[]) => apply(await request(operations));
  const tools = mindmapAgentTools({
    check: () => undefined,
    target: () => undefined,
    page,
    get model() {
      return model();
    },
    selected: () => [],
    revision: () => sessions.snapshot(view.leaseId, 1).revision,
    flush: async () => undefined,
    show: () => undefined,
    write: async args => {
      try {
        const receipt = await apply({
          domain: "mindmap",
          owner: "main-chat:mindmap",
          pageId,
          requestId: String(args.requestId),
          operations: args.operations as Record<string, unknown>[],
          preconditions: args.preconditions as AgentBoardRequest["preconditions"],
        });
        if (loseReply) {
          loseReply = false;
          throw new Error("回复连接中断");
        }
        return { content: JSON.stringify(receipt) };
      } catch (error) {
        throw new Error(
          "Error invoking remote method 'whiteboard-document:agent-apply': Error: " +
            (error instanceof Error ? error.message : String(error))
        );
      }
    },
  });
  const call = async (name: string, args: Record<string, unknown>) => {
    const tool = tools.find(tool => tool.name === name);
    if (!tool) throw new Error("缺少工具");
    const result = await tool.executor({ target: "test", ...args });
    if (!result || typeof result === "string") throw new Error("缺少结果");
    return { ...result, value: JSON.parse(result.content) };
  };
  const base = await write([
    { kind: "insert", id: "root", text: "原生导图", at: { x: 400, y: 300 } },
    { kind: "insert", id: "a", parentId: "root", text: "甲" },
    { kind: "insert", id: "b", parentId: "root", text: "乙" },
    { kind: "insert", id: "c", parentId: "root", text: "丙" },
  ]);
  return {
    db,
    sessions,
    view,
    contentId: created.contentIds[0],
    pageId,
    model,
    page,
    request,
    apply,
    write,
    call,
    ids: base.ids,
    loseNextReply: () => {
      loseReply = true;
    },
  };
}

describe("Agent 原生思维导图", () => {
  it("硬限额反馈给出具体预算并要求修正参数，不能引导模型仅重读后重试", async () => {
    const f = await fixture();
    const markdown = Array.from(
      { length: WHITEBOARD_LIMITS.payloadDepth + 1 },
      (_, level) => "  ".repeat(level) + "- 层级"
    ).join("\n");
    const before = f.page();
    const result = await f.call("apply_whiteboard_mindmap_operations", {
      requestId: "depth-feedback",
      preconditions: (await f.request([])).preconditions,
      operations: [{ kind: "insert", id: "too-deep", parentId: f.ids.root, markdown }],
    });
    expect(result.value.error).toMatchObject({
      code: "LIMIT_EXCEEDED",
      retry: "fix_arguments",
      commitStatus: "not_applied",
      operationIndex: 0,
    });
    expect(typeof result.value.error.expected.payloadDepth).toBe("number");
    expect(f.page()).toEqual(before);
  });

  it("批量改字仍拒绝跨页及同批已删除目标，允许编辑本批刚创建的原生节点", async () => {
    const f = await fixture(),
      client = f.model();
    const vector = Y.encodeStateVector(client.doc);
    const source = client.read().pages[0].children[0];
    client.submit(
      [
        { type: "create_page", id: "foreign-page", title: "其他页" },
        {
          type: "create",
          id: "foreign-node",
          contractId: source.contractId,
          parent: { kind: "page", id: "foreign-page" },
          geometry: source.geometry,
          data: {},
          body: source.body,
        },
      ],
      "human"
    );
    await f.sessions.append(
      f.view.leaseId,
      1,
      "foreign-page",
      Y.encodeStateAsUpdate(client.doc, vector)
    );
    const rejected = await f.call("apply_whiteboard_mindmap_operations", {
      requestId: "wrong-page-text",
      preconditions: (await f.request([])).preconditions,
      operations: [{ kind: "edit_text", id: "foreign-node", text: "不可跨页写入" }],
    });
    expect(rejected.value.error).toMatchObject({
      code: "ELEMENT_NOT_FOUND",
      commitStatus: "not_applied",
      operationIndex: 0,
    });
    const before = f.page();
    const deleted = await f.call("apply_whiteboard_mindmap_operations", {
      requestId: "removed-text",
      preconditions: (await f.request([])).preconditions,
      operations: [
        { kind: "remove", id: f.ids.a },
        { kind: "edit_text", id: f.ids.a, text: "不可复活" },
      ],
    });
    expect(deleted.value.error).toMatchObject({
      code: "ELEMENT_NOT_FOUND",
      operationIndex: 1,
      commitStatus: "not_applied",
    });
    expect(f.page()).toEqual(before);
    const created = await f.write([
      { kind: "insert", id: "fresh", parentId: f.ids.root, text: "先创建" },
      { kind: "edit_text", id: "fresh", text: "再改字" },
    ]);
    const body = mindIndex(f.page()).nodes.get(created.ids.fresh)?.body;
    expect(Array.isArray(body) && labels(body)).toBe("再改字");
  });

  it("向中心左侧添加的是原生子节点，重试和重新打开不会产生文本框或箭头副本", async () => {
    const f = await fixture();
    const request = await f.request([
      { kind: "insert", id: "world", parentId: f.ids.root, side: "left", text: "世界这么大" },
    ]);
    const saved = await f.apply(request);
    expect((await f.apply(request)).operationRevision).toBe(saved.operationRevision);
    await f.sessions.release(f.view.leaseId, 1);
    const reopened = await f.sessions.open("mindmap-test", f.contentId, 1, "reopened");
    const doc = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(doc, reopened.state);
      const model = new WhiteboardModel(doc);
      const root = model.read().pages[0].children.find(node => node.id === f.ids.root);
      const child = root?.children.find(node => node.id === saved.ids.world);
      // 事故回归：之前同一句指令只创建了独立文本与普通箭头，没有导图父子关系。
      expect(child?.type).toBe("mind-node");
      expect(child?.data.direction).toBe("left");
      expect(Array.isArray(child?.body) && labels(child.body)).toBe("世界这么大");
      expect(model.read().pages[0].children.every(node => node.type === "mind-node")).toBe(true);
      expect(root?.children.filter(node => node.id === saved.ids.world)).toHaveLength(1);
      model.dispose();
    } finally {
      doc.destroy();
    }
  });

  it("后续操作失败时整批回滚，并返回操作位置、违反的约束和修正建议", async () => {
    const f = await fixture(),
      before = f.page();
    const result = await f.call("apply_whiteboard_mindmap_operations", {
      requestId: "atomic-cycle",
      preconditions: await mindPreconditions(before, [...mindIndex(before).nodes.keys()]),
      operations: [
        { kind: "insert", id: "new", parentId: f.ids.a, text: "子树" },
        { kind: "move", id: f.ids.a, parentId: "new" },
      ],
    });
    expect(result.value.error).toMatchObject({
      code: "CYCLE_DETECTED",
      operationIndex: 1,
      operationKind: "move",
      path: "operations[1].parentId",
      commitStatus: "not_applied",
      retry: "fix_arguments",
    });
    expect(result.value.error.suggestion.length).toBeGreaterThan(0);
    expect(result.isParameterError).toBe(true);
    expect(f.page()).toEqual(before);
  });

  it("无关样式变化不阻止改字，已观察正文变化会拒绝覆盖并给出冲突字段", async () => {
    const f = await fixture();
    const edit = await f.request([{ kind: "edit_text", id: f.ids.a, text: "更改正文" }]);
    await f.write([{ kind: "configure", id: f.ids.a, textColor: "#ff0000" }]);
    await f.apply(edit);
    const stale = await f.request([{ kind: "edit_text", id: f.ids.a, text: "旧意图" }]);
    await f.write([{ kind: "edit_text", id: f.ids.a, text: "别人新写的正文" }]);
    try {
      await f.apply(stale);
      throw new Error("应当拒绝冲突");
    } catch (error) {
      expect(mindErrorDetails(error)).toMatchObject({
        code: "PRECONDITION_CONFLICT",
        operationIndex: 0,
        elementIds: [f.ids.a],
        retry: "reread",
        commitStatus: "not_applied",
      });
    }
    const node = mindIndex(f.page()).nodes.get(f.ids.a);
    expect(Array.isArray(node?.body) && labels(node.body)).toBe("别人新写的正文");
    expect(node?.data.textColor).toBe("#ff0000");
  });

  it("删除区间端点时概要外框收缩，清空范围时连带清理概要子树及其联系线", async () => {
    const f = await fixture();
    const saved = await f.write([
      { kind: "summary", id: "summary", nodeIds: [f.ids.a, f.ids.b], text: "总结" },
      { kind: "insert", id: "summary-child", parentId: "summary", text: "补充" },
      { kind: "boundary", id: "boundary", nodeIds: [f.ids.a, f.ids.b], title: "范围" },
      { kind: "relation", id: "relation", from: "summary", to: f.ids.c, text: "联系" },
    ]);
    await f.write([{ kind: "remove", id: f.ids.a }]);
    let root = mindIndex(f.page()).nodes.get(f.ids.root);
    expect(root?.children.find(node => node.id === saved.ids.summary)?.data.summaryRange).toEqual({
      startId: f.ids.b,
      endId: f.ids.b,
    });
    expect(root?.data.boundaries).toEqual([
      { id: saved.ids.boundary, startId: f.ids.b, endId: f.ids.b, title: "范围" },
    ]);
    await f.write([{ kind: "remove", id: f.ids.b }]);
    const index = mindIndex(f.page());
    root = index.nodes.get(f.ids.root);
    expect(index.nodes.has(saved.ids.summary)).toBe(false);
    expect(index.nodes.has(saved.ids["summary-child"])).toBe(false);
    expect(index.nodes.has(saved.ids.relation)).toBe(false);
    expect(root?.data.boundaries ?? []).toEqual([]);
    expect(index.nodes.has(f.ids.c)).toBe(true);
  });

  it("跨图移动保留节点身份及正文，源范围修整且子孙沿新分支方向展开", async () => {
    const f = await fixture();
    const extra = await f.write([
      { kind: "insert", id: "other", text: "另一导图", at: { x: 900, y: 300 } },
      { kind: "insert", id: "deep", parentId: f.ids.a, text: "后代" },
      { kind: "boundary", id: "range", nodeIds: [f.ids.a, f.ids.b], title: "源范围" },
    ]);
    await f.write([{ kind: "move", id: f.ids.a, parentId: extra.ids.other, side: "left" }]);
    const index = mindIndex(f.page());
    expect(index.parents.get(f.ids.a)?.id).toBe(extra.ids.other);
    expect(index.nodes.get(f.ids.a)?.children[0].id).toBe(extra.ids.deep);
    expect(index.sides.get(extra.ids.deep)).toBe("left");
    expect(index.nodes.get(f.ids.root)?.data.boundaries).toEqual([
      { id: extra.ids.range, startId: f.ids.b, endId: f.ids.b, title: "源范围" },
    ]);
    await f.write([{ kind: "move", id: extra.ids.other, at: { x: 1200, y: 500 } }]);
    expect(mindIndex(f.page()).sides.get(f.ids.a)).toBe("left");
    const copy = await f.write([
      { kind: "copy", id: "copied-map", sourceId: extra.ids.other, at: { x: 1800, y: 500 } },
    ]);
    expect(mindIndex(f.page()).nodes.get(copy.ids["copied-map"])?.children[0].data.direction).toBe(
      "left"
    );
  });

  it("Markdown 和可编辑结构往返保留富文本，复制范围的端点指向新身份", async () => {
    const f = await fixture();
    const imported = await f.write([
      {
        kind: "insert",
        id: "outline",
        at: { x: 700, y: 100 },
        markdown: "- 项目\n  - **重点**\n  - [资料](https://example.com)",
      },
    ]);
    const root = must(mindIndex(f.page()).nodes.get(imported.ids.outline), "缺少测试数据");
    await f.write([
      { kind: "boundary", id: "box", nodeIds: root.children.map(node => node.id), title: "资料" },
      { kind: "summary", id: "summary", nodeIds: root.children.map(node => node.id), text: "概括" },
    ]);
    const exported = await f.call("read_whiteboard_mindmap", {
      nodeId: root.id,
      format: "transfer",
      includeContent: true,
    });
    const copied = await f.write([
      {
        kind: "insert",
        id: "roundtrip",
        at: { x: 1100, y: 100 },
        transfer: exported.value.transfer,
      },
    ]);
    const index = mindIndex(f.page()),
      original = must(index.nodes.get(root.id), "缺少测试数据"),
      next = must(index.nodes.get(copied.ids.roundtrip), "缺少测试数据");
    const semantic = (node: typeof root): unknown => ({
      text: Array.isArray(node.body)
        ? node.body.map(value => ({ ...value, collabId: undefined }))
        : node.body,
      children: node.children.map(semantic),
    });
    const stripIds = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(stripIds)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .filter(([key]) => key !== "collabId")
                .map(([key, value]) => [key, stripIds(value)])
            )
          : value;
    expect(stripIds(semantic(next))).toEqual(stripIds(semantic(original)));
    expect(next.id).not.toBe(original.id);
    const newIds = new Set(next.children.map(node => node.id));
    const summary = must(
      next.children.find(node => node.data.summaryRange),
      "缺少测试数据"
    );
    expect(summary.data.summaryRange).toMatchObject({
      startId: next.children[0].id,
      endId: next.children[1].id,
    });
    expect(newIds.has(original.children[0].id)).toBe(false);
    await f.model().validate();
  });

  it("单侧布局拒绝伪称左分支，切回双向布局保留此前分支方向", async () => {
    const f = await fixture();
    await f.write([
      { kind: "move", id: f.ids.a, parentId: f.ids.root, side: "left" },
      {
        kind: "configure",
        id: f.ids.root,
        layout: "logic",
        themeStyle: "outline",
        sketch: { mode: "sketch", level: "neat" },
      },
    ]);
    const result = await f.call("apply_whiteboard_mindmap_operations", {
      requestId: "wrong-side",
      preconditions: await mindPreconditions(f.page(), [f.ids.root]),
      operations: [
        { kind: "insert", id: "bad", parentId: f.ids.root, side: "left", text: "不应创建" },
      ],
    });
    expect(result.value.error).toMatchObject({
      code: "SIDE_NOT_SUPPORTED",
      expected: ["right"],
      actual: "left",
      path: "operations[0].side",
    });
    await f.write([{ kind: "configure", id: f.ids.root, layout: "mind" }]);
    expect(mindIndex(f.page()).sides.get(f.ids.a)).toBe("left");
  });

  it("读取包含折叠后代，分页变化明确拒绝，缺少读前提能够按反馈修正", async () => {
    const f = await fixture();
    await f.write([{ kind: "fold", id: f.ids.root, folded: true }]);
    const read = await f.call("read_whiteboard_mindmap", {
      nodeId: f.ids.root,
      depth: 2,
      limit: 2,
      includeContent: true,
    });
    expect(read.value.nodes.find((node: { id: string }) => node.id === f.ids.a)?.hidden).toBe(true);
    expect(read.value.next).toMatchObject({ offset: 2 });
    const failed = await f.call("apply_whiteboard_mindmap_operations", {
      requestId: "missing-read",
      operations: [{ kind: "insert", id: "fixed", parentId: f.ids.root, text: "反馈修正" }],
    });
    expect(failed.value.error).toMatchObject({
      code: "READ_REQUIRED",
      retry: "reread",
      commitStatus: "not_applied",
    });
    await f.call("apply_whiteboard_mindmap_operations", {
      requestId: "fixed-read",
      preconditions: read.value.preconditions,
      operations: [{ kind: "insert", id: "fixed", parentId: f.ids.root, text: "反馈修正" }],
    });
    const continuation = await f.call("read_whiteboard_mindmap", {
      nodeId: f.ids.root,
      depth: 2,
      ...read.value.next,
    });
    expect(continuation.value.error).toMatchObject({ code: "READ_PAGE_CHANGED", retry: "reread" });
  });

  it("局部改字保留未修改文字的格式，联系线反转保留标签与样式", async () => {
    const f = await fixture();
    const created = await f.write([
      {
        kind: "insert",
        id: "rich",
        parentId: f.ids.root,
        content: [
          { type: "paragraph", children: [{ text: "保留", bold: true }, { text: "旧文字" }] },
        ],
      },
      { kind: "relation", id: "link", from: f.ids.a, to: f.ids.b, text: "关联" },
    ]);
    await f.write([
      { kind: "edit_text", id: created.ids.rich, offset: 2, remove: 3, text: "新文字" },
      {
        kind: "relation",
        action: "update",
        id: created.ids.link,
        reverse: true,
        style: { lineWidth: 2.5 },
      },
    ]);
    const index = mindIndex(f.page()),
      body = index.nodes.get(created.ids.rich)?.body;
    expect(Array.isArray(body) && body[0].children?.[0]).toMatchObject({
      text: "保留",
      bold: true,
    });
    const link = must(index.nodes.get(created.ids.link), "缺少测试数据");
    expect(link.data.source).toMatchObject({ bindId: f.ids.b, marker: "none" });
    expect(link.data.target).toMatchObject({ bindId: f.ids.a, marker: "open-arrow" });
    expect(link.data.lineWidth).toBe(2.5);
    expect(Array.isArray(link.body) && labels(link.body)).toBe("关联");
    await f.write([
      { kind: "edit_text", id: created.ids.rich, offset: 2, length: 3, marks: { italic: true } },
      {
        kind: "relation",
        action: "update",
        id: created.ids.link,
        from: created.ids.rich,
        style: { sourceMarker: "circle" },
      },
    ]);
    const changed = mindIndex(f.page());
    expect(changed.nodes.get(created.ids.link)?.data.source).toMatchObject({
      bindId: created.ids.rich,
      marker: "circle",
    });
    const formatted = changed.nodes.get(created.ids.rich)?.body;
    if (!formatted || typeof formatted === "string") throw new Error("预期节点富文本正文");
    expect(labels(formatted)).toBe("保留新文字");
    expect(
      formatted[0].children?.some(leaf => leaf.text === "新文字" && leaf.italic === true)
    ).toBe(true);
  });

  it("笔记实体解析为原生正文引用，复制分支共享笔记但重新分配节点身份，解除关联不删笔记", async () => {
    const f = await fixture();
    const content = Number(
      f.db.prepare("INSERT INTO contents(content,create_time,update_time) VALUES ('[]',1,1)").run()
        .lastInsertRowid
    );
    const cardId = Number(
      f.db
        .prepare("INSERT INTO cards(content_id,create_time,update_time) VALUES (?,1,1)")
        .run(content).lastInsertRowid
    );
    const entity = ContentIdentityTable.reference(f.db, "card", cardId);
    await f.write([{ kind: "note", id: f.ids.a, entity, title: "关联笔记" }]);
    const linked = must(mindIndex(f.page()).nodes.get(f.ids.a), "缺少测试数据");
    expect(linked.entity?.kind).toBe("content");
    expect(ContentIdentityTable.resolve(f.db, must(linked.entity, "缺少测试数据"))).toBe(content);
    const copy = await f.write([{ kind: "copy", id: "copy", sourceId: f.ids.a }]);
    const copied = must(mindIndex(f.page()).nodes.get(copy.ids.copy), "缺少测试数据");
    expect(copied.id).not.toBe(linked.id);
    expect(copied.entity).toEqual(linked.entity);
    await f.write([{ kind: "note", id: copy.ids.copy, entity: null }]);
    expect(mindIndex(f.page()).nodes.get(copy.ids.copy)?.entity).toBeUndefined();
    expect(f.db.prepare("SELECT id FROM contents WHERE id=?").get(content)).toEqual({
      id: content,
    });
    expect(mindIndex(f.page()).nodes.get(f.ids.a)?.entity).toEqual(linked.entity);
  });

  it("已提交但回执丢失时明确要求原请求重试，修正请求身份的误用不会重复添加", async () => {
    const f = await fixture();
    const request = await f.request([
      { kind: "insert", id: "durable", parentId: f.ids.root, text: "只创建一次" },
    ]);
    const args = {
      requestId: request.requestId,
      preconditions: request.preconditions,
      operations: request.operations,
    };
    f.loseNextReply();
    const interrupted = await f.call("apply_whiteboard_mindmap_operations", args);
    expect(interrupted.value.error).toMatchObject({
      code: "WRITE_OUTCOME_UNKNOWN",
      commitStatus: "unknown",
      retry: "same_request",
    });
    const retried = await f.call("apply_whiteboard_mindmap_operations", args);
    expect(retried.value.ok).toBe(true);
    expect(
      mindIndex(f.page())
        .nodes.get(f.ids.root)
        ?.children.filter(node => node.id === retried.value.ids.durable)
    ).toHaveLength(1);
    const changed = await f.call("apply_whiteboard_mindmap_operations", {
      ...args,
      operations: [{ ...request.operations[0], text: "改变了请求" }],
    });
    expect(changed.value.error).toMatchObject({
      code: "REQUEST_ID_REUSED",
      commitStatus: "not_applied",
      retry: "fix_arguments",
    });
  });

  it("读工具能继续分页读取跨分支联系线与外框，不把截断当作没有关联", async () => {
    const f = await fixture();
    const created = await f.write([
      { kind: "boundary", id: "box1", nodeIds: [f.ids.a], title: "甲范围" },
      { kind: "boundary", id: "box2", nodeIds: [f.ids.b], title: "乙范围" },
      { kind: "relation", id: "link1", from: f.ids.a, to: f.ids.b },
      { kind: "relation", id: "link2", from: f.ids.a, to: f.ids.c },
    ]);
    const first = await f.call("read_whiteboard_mindmap", {
      nodeId: f.ids.a,
      section: "relations",
      limit: 1,
    });
    const second = await f.call("read_whiteboard_mindmap", { ...first.value.next, limit: 1 });
    expect(new Set([first.value.relations[0].id, second.value.relations[0].id])).toEqual(
      new Set([created.ids.link1, created.ids.link2])
    );
    expect(second.value.next).toBeNull();
    const box = await f.call("read_whiteboard_mindmap", {
      nodeId: f.ids.root,
      section: "boundaries",
      limit: 1,
    });
    const nextBox = await f.call("read_whiteboard_mindmap", { ...box.value.next, limit: 1 });
    expect(
      new Set([box.value.boundaries[0].boundary.id, nextBox.value.boundaries[0].boundary.id])
    ).toEqual(new Set([created.ids.box1, created.ids.box2]));
  });
});
