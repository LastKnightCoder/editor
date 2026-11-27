import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { WhiteboardModel } from "./whiteboard-model";
import { WHITEBOARD_LIMITS } from "./model-limits";
import {
  fixture,
  model,
  documents,
  create,
  shapeGeometry,
  pageParent,
  elementParent,
  flat,
  converge,
} from "./whiteboard-test-utils";
import type { WhiteboardModelCommand } from "./whiteboard-types";

afterEach(() => documents.splice(0).forEach(doc => doc.destroy()));
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

describe("白板模型预算与写入边界", () => {
  async function translationFixture() {
    const f = await fixture();
    const target = create(f.board, f.shape, pageParent(f.page));
    const doc = new Y.Doc({ gc: false });
    documents.push(doc);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(f.board.doc));
    const board = new WhiteboardModel(doc);
    board.prepareLocalTranslations();
    return { board, doc, target };
  }

  it("单节点平移保留撤销和同步，观察者附加写入后重新核对投影", async () => {
    const { board, doc, target } = await translationFixture();
    const origin = {};
    const history = board.createUndoManager({ trackedOrigins: new Set([origin]) });
    const next = { ...shapeGeometry, x: -Math.PI, y: Number.MAX_VALUE };
    expect(board.tryLocalTranslation(target, next, origin)?.isolated).toBe(true);
    expect(flat(board.read())[0].geometry).toEqual(next);
    expect(flat(model(Y.encodeStateAsUpdate(doc)).read())[0].geometry).toEqual(next);
    history.undo();
    expect(flat(board.read())[0].geometry).toEqual(shapeGeometry);
    const edit = () => {
      doc.off("update", edit);
      board.title.insert(0, "另一笔写入");
    };
    doc.on("update", edit);
    expect(board.tryLocalTranslation(target, next, origin)?.isolated).toBe(false);
    expect(board.readSummary().title).toContain("另一笔写入");
    history.destroy();
  });

  it("几何批次先验证全部目标，保留撤销同步并拒绝末项非法", async () => {
    const { board, doc, target } = await translationFixture();
    const snapshot = board.read(),
      first = flat(snapshot)[0];
    const other = board.submit(
      [
        {
          type: "create",
          contractId: first.contractId,
          parent: pageParent(snapshot.pages[0].id),
          data: { source: "另一项" },
          geometry: shapeGeometry,
          body: "",
        },
      ],
      null
    ).createdIds[0];
    board.prepareLocalTranslations();
    const before = board.read(),
      vector = Y.encodeStateVector(doc),
      origin = {};
    const history = board.createUndoManager({
      trackedOrigins: new Set([origin]),
      captureTimeout: 0,
    });
    expect(() =>
      board.tryLocalGeometries(
        [
          { id: target, geometry: { ...shapeGeometry, x: 200 } },
          { id: other, geometry: { ...shapeGeometry, width: -1 } },
        ],
        origin
      )
    ).toThrow();
    expect(board.read()).toEqual(before);
    expect(Y.encodeStateVector(doc)).toEqual(vector);
    expect(history.undoStack).toHaveLength(0);
    const values = [
      { id: target, geometry: { ...shapeGeometry, x: Number.MAX_VALUE, y: -Math.PI } },
      { id: other, geometry: { ...shapeGeometry, width: 300 } },
    ];
    expect(board.tryLocalGeometries(values, origin)?.isolated).toBe(true);
    expect(flat(board.read()).map(node => node.geometry)).toEqual(
      values.map(node => node.geometry)
    );
    expect(model(Y.encodeStateAsUpdate(doc)).read()).toEqual(board.read());
    history.undo();
    expect(board.read()).toEqual(before);
    history.redo();
    expect(flat(board.read()).map(node => node.geometry)).toEqual(
      values.map(node => node.geometry)
    );
    const edit = () => {
      doc.off("update", edit);
      board.title.insert(0, "观察者写入");
    };
    doc.on("update", edit);
    expect(
      board.tryLocalGeometries([{ id: target, geometry: shapeGeometry }], origin)?.isolated
    ).toBe(false);
    expect(board.readSummary().title).toContain("观察者写入");
    history.destroy();
  });

  it("几何批次在容量临界和新增未编码根时回到完整验证", async () => {
    const { board, doc, target } = await translationFixture();
    board.title.insert(
      0,
      "a".repeat(WHITEBOARD_LIMITS.documentBytes - Y.encodeStateAsUpdate(doc).length - 300)
    );
    const before = Y.encodeStateAsUpdate(doc);
    expect(
      board.tryLocalGeometries([{ id: target, geometry: { ...shapeGeometry, x: 20 } }], null)
    ).toBeUndefined();
    expect(Buffer.compare(before, Y.encodeStateAsUpdate(doc))).toBe(0);
    const fresh = await translationFixture();
    for (let i = 0; i <= WHITEBOARD_LIMITS.richTextRoots; i++)
      fresh.doc.getMap(`node-tree:roots:unknown-${i}:nodes`);
    expect(
      fresh.board.tryLocalGeometries([{ id: fresh.target, geometry: shapeGeometry }], null)
    ).toBeUndefined();
  });

  it("局部正文写入保留格式与撤销；跨过文档容量时不产生半次写入", async () => {
    const seed = await fixture();
    const target = create(seed.board, seed.rich, pageParent(seed.page), "seed", [
      { type: "paragraph", children: [{ text: "甲" }] },
    ]);
    const doc = new Y.Doc({ gc: false });
    documents.push(doc);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed.board.doc));
    const board = new WhiteboardModel(doc);
    const tree = board.richText(target);
    const nodeId = tree.read()[0].collabId as string;
    const origin = {};
    const history = board.createUndoManager({
      trackedOrigins: new Set([origin]),
      captureTimeout: 0,
    });
    const edit = {
      action: "insert" as const,
      nodeId,
      offset: 1,
      text: "乙",
      marks: { bold: true },
    };
    board.prepareLocalTranslations();
    expect(board.tryLocalBodyEdit(target, edit, origin)?.isolated).toBe(true);
    expect(tree.read()[0].children).toMatchObject([{ text: "甲" }, { text: "乙", bold: true }]);
    expect(model(Y.encodeStateAsUpdate(doc)).read()).toEqual(board.read());
    history.undo();
    expect(tree.read()[0].children).toMatchObject([{ text: "甲" }]);
    history.redo();
    expect(board.tryLocalBodyEdit(target, { ...edit, action: "remove" }, origin)?.isolated).toBe(
      true
    );
    expect(tree.read()[0].children).toMatchObject([{ text: "甲" }]);
    board.title.insert(
      0,
      "a".repeat(WHITEBOARD_LIMITS.documentBytes - Y.encodeStateAsUpdate(doc).length - 256)
    );
    const before = Y.encodeStateAsUpdate(doc);
    const large = "文".repeat(256);
    expect(board.tryLocalBodyEdit(target, { ...edit, text: large }, origin)).toBeUndefined();
    expect(() =>
      board.withPreparedContracts(
        [],
        candidate => candidate.richText(target).insertText(nodeId, 1, large, origin),
        origin
      )
    ).toThrow("预算");
    expect(Buffer.compare(before, Y.encodeStateAsUpdate(doc))).toBe(0);
    history.destroy();
  });

  it("编码接近上限时平移交回精确预检，超过上限时保留最后确认位置", async () => {
    const { board, doc, target } = await translationFixture();
    const limit = WHITEBOARD_LIMITS.documentBytes;
    board.title.insert(0, "a".repeat(limit - Y.encodeStateAsUpdate(doc).length - 300));
    const length = () => Y.encodeStateAsUpdate(doc).length;
    expect(limit - length()).toBeGreaterThan(0);
    expect(limit - length()).toBeLessThan(1024);
    const move = (x: number) =>
      board.submit(
        [{ type: "set_node", id: target, patch: { geometry: { ...shapeGeometry, x } } }],
        null
      );
    expect(board.tryLocalTranslation(target, { ...shapeGeometry, x: 1 }, null)).toBeUndefined();
    move(1);
    expect(flat(board.read())[0].geometry.x).toBe(1);
    let last = 1;
    for (let x = 2; x <= 32; x++) {
      try {
        move(x);
        last = x;
      } catch (error) {
        expect(String(error)).toMatch(/预算/);
        break;
      }
    }
    expect(last).toBeLessThan(32);
    expect(length()).toBeLessThanOrEqual(limit);
    expect(flat(board.read())[0].geometry.x).toBe(last);
  });

  it("新增未编码根或无效几何不能借用上一轮平移的预算", async () => {
    const { board, doc, target } = await translationFixture();
    expect(() => board.tryLocalTranslation(target, { ...shapeGeometry, x: NaN }, null)).toThrow();
    for (let i = 0; i <= WHITEBOARD_LIMITS.richTextRoots; i++)
      doc.getMap(`node-tree:roots:empty-${i}:nodes`);
    expect(board.tryLocalTranslation(target, { ...shapeGeometry, x: 20 }, null)).toBeUndefined();
    expect(flat(board.read())[0].geometry.x).toBe(shapeGeometry.x);
  });

  it("结构草稿余量不足时交回精确候选，真超限仍零写入", async () => {
    const { board, doc, target } = await translationFixture();
    const [first, second] = board.read().pages;
    const limit = WHITEBOARD_LIMITS.documentBytes;
    board.title.insert(0, "z".repeat(limit - Y.encodeStateAsUpdate(doc).length - 700));
    board.prepareLocalTranslations();
    const commands: WhiteboardModelCommand[] = [
      { type: "move_node", id: target, parent: pageParent(second.id) },
    ];
    const before = Y.encodeStateVector(doc);
    expect(board.tryLocalStructure(commands, {})).toBeUndefined();
    expect(Y.encodeStateVector(doc)).toEqual(before);
    const handoff = board.capturePreparedUpdate(commands),
      candidate = board.forkPreparedBaseline();
    documents.push(candidate.doc);
    if (!handoff) throw new Error("没有生成交接票据");
    const vector = Y.encodeStateVector(candidate.doc);
    candidate.submit(commands, {});
    const delta = Y.encodeStateAsUpdate(candidate.doc, vector);
    expect(handoff(() => Y.applyUpdate(doc, delta), {})).toEqual({
      isolated: true,
      snapshot: true,
      capacity: false,
    });
    expect(board.read().pages[1].children.map(node => node.id)).toContain(target);
    expect(Y.encodeStateAsUpdate(doc).length).toBeLessThanOrEqual(limit);
    const remaining = limit - Y.encodeStateAsUpdate(doc).length;
    board.title.insert(0, "z".repeat(remaining - 64));
    board.prepareLocalTranslations();
    const full = Y.encodeStateAsUpdate(doc);
    const back: WhiteboardModelCommand[] = [
      { type: "move_node", id: target, parent: pageParent(first.id) },
    ];
    expect(board.tryLocalStructure(back, {})).toBeUndefined();
    expect(() => board.submit(back, {})).toThrow("预算");
    expect(Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(doc)), Buffer.from(full))).toBe(0);
  });

  it("页预算包含删除和撤销创建后保留的页，边界外零写入", async () => {
    const { board, page } = await fixture();
    board.submit(
      Array.from({ length: WHITEBOARD_LIMITS.pages - 2 }, () => ({
        type: "create_page",
        title: "页",
      })),
      {}
    );
    expect(board.read().pages).toHaveLength(WHITEBOARD_LIMITS.pages);
    board.submit([{ type: "remove_page", id: page, observedElementIds: [] }], {});
    const before = Y.encodeStateAsUpdate(board.doc);
    expect(() => board.submit([{ type: "create_page", title: "超限" }], {})).toThrow("预算");
    expect(Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(board.doc)), Buffer.from(before))).toBe(
      0
    );
  });
  it("元素预算跨页合计，删除不释放额度", async () => {
    const { board, page, secondPage, container } = await fixture();
    let remaining = WHITEBOARD_LIMITS.elements;
    while (remaining) {
      const count = Math.min(WHITEBOARD_LIMITS.commandsPerBatch, remaining);
      board.submit(
        Array.from({ length: count }, (_, index) => ({
          type: "create",
          contractId: container,
          geometry: shapeGeometry,
          data: {},
          parent: pageParent(index % 2 ? page : secondPage),
        })),
        "seed"
      );
      remaining -= count;
    }
    expect(flat(board.read())).toHaveLength(WHITEBOARD_LIMITS.elements);
    board.submit([{ type: "remove_nodes", ids: [flat(board.read())[0].id] }], {});
    const before = Y.encodeStateAsUpdate(board.doc);
    expect(() => create(board, container, pageParent(page))).toThrow("预算");
    expect(Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(board.doc)), Buffer.from(before))).toBe(
      0
    );
  }, 30000);
  it("空富文本根也占额度，重开和二进制恢复不能绕过根预算", async () => {
    const { board, page, rich } = await fixture();
    let remaining = WHITEBOARD_LIMITS.richTextRoots;
    while (remaining) {
      const count = Math.min(WHITEBOARD_LIMITS.commandsPerBatch, remaining);
      board.submit(
        Array.from({ length: count }, () => ({
          type: "create",
          contractId: rich,
          geometry: shapeGeometry,
          data: {},
          parent: pageParent(page),
        })),
        "seed"
      );
      remaining -= count;
    }
    const restored = model(Y.encodeStateAsUpdate(board.doc)),
      target = flat(restored.read())[0].id;
    expect(restored.richText(target)).toBe(restored.richText(target));
    const before = Y.encodeStateAsUpdate(restored.doc);
    expect(() => create(restored, rich, pageParent(page))).toThrow("预算");
    expect(Y.encodeStateAsUpdate(restored.doc)).toEqual(before);
  }, 30000);
  it("未编码的空公共节点根仍占预算，预检不会漏掉后在真实事务中半途失败", async () => {
    const { board, page, rich } = await fixture();
    for (let index = 0; index < WHITEBOARD_LIMITS.richTextRoots; index++)
      board.doc.getMap(`node-tree:roots:reserved-${index}:nodes`);
    const before = Y.encodeStateAsUpdate(board.doc),
      shares = board.doc.share.size;
    expect(() => create(board, rich, pageParent(page))).toThrow("预算");
    expect(board.elements.size).toBe(0);
    expect(board.doc.share.size).toBe(shares);
    expect(Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(board.doc)), Buffer.from(before))).toBe(
      0
    );
  });
  it("单批数量到 256 通过，257 整批拒绝", async () => {
    const { board, page, shape } = await fixture(),
      target = create(board, shape, pageParent(page));
    const command: WhiteboardModelCommand = { type: "set_data", id: target, patch: { count: 1 } };
    board.submit(
      Array.from({ length: WHITEBOARD_LIMITS.commandsPerBatch }, () => command),
      {}
    );
    const before = Y.encodeStateAsUpdate(board.doc);
    expect(() =>
      board.submit(
        Array.from({ length: WHITEBOARD_LIMITS.commandsPerBatch + 1 }, () => command),
        {}
      )
    ).toThrow("预算");
    expect(Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(board.doc)), Buffer.from(before))).toBe(
      0
    );
  });
  it("补丁按 UTF-8 计量，64 KiB 恰好通过，增加一个字节不写入", async () => {
    const { board, page, shape } = await fixture(),
      target = create(board, shape, pageParent(page));
    const size = WHITEBOARD_LIMITS.patchBytes - bytes({ patch: { value: "" }, unset: [] });
    const patch = { value: "汉".repeat(Math.floor(size / 3)) + "x".repeat(size % 3) };
    expect(bytes({ patch, unset: [] })).toBe(WHITEBOARD_LIMITS.patchBytes);
    board.submit([{ type: "set_data", id: target, patch }], {});
    const before = Y.encodeStateAsUpdate(board.doc);
    expect(() =>
      board.submit([{ type: "set_data", id: target, patch: { value: patch.value + "x" } }], {})
    ).toThrow("预算");
    expect(Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(board.doc)), Buffer.from(before))).toBe(
      0
    );
  });
  it("不同补丁累积的数据可超过单补丁限额，不把 64 KiB 误作元素总量", async () => {
    const { board, page, shape } = await fixture(),
      target = create(board, shape, pageParent(page));
    for (const key of ["one", "two"])
      board.submit([{ type: "set_data", id: target, patch: { [key]: "x".repeat(40000) } }], {});
    expect(bytes(flat(board.read())[0].data)).toBeGreaterThan(WHITEBOARD_LIMITS.patchBytes);
    const peer = model();
    await peer.receive(Y.encodeStateAsUpdate(board.doc));
    expect(peer.read()).toEqual(board.read());
  });
  it("批次总字节独立限制，512 KiB 到边界通过，多一个字节拒绝", async () => {
    const { board, page, shape } = await fixture(),
      target = create(board, shape, pageParent(page));
    const empty: WhiteboardModelCommand = {
      type: "edit_text",
      id: target,
      field: "source",
      edit: { offset: 0, remove: 0, text: "" },
    };
    const command = {
      ...empty,
      edit: { ...empty.edit, text: "x".repeat(WHITEBOARD_LIMITS.batchBytes - bytes([empty])) },
    };
    expect(bytes([command])).toBe(WHITEBOARD_LIMITS.batchBytes);
    board.submit([command], {});
    const before = Y.encodeStateAsUpdate(board.doc);
    expect(() =>
      board.submit([{ ...command, edit: { ...command.edit, text: command.edit.text + "x" } }], {})
    ).toThrow("预算");
    expect(Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(board.doc)), Buffer.from(before))).toBe(
      0
    );
  });
  it("实际编码状态接近 8 MiB 时，跨界的文字编辑在写入前拒绝", async () => {
    const { board } = await fixture();
    board.title.insert(
      0,
      "x".repeat(
        WHITEBOARD_LIMITS.documentBytes - Y.encodeStateAsUpdate(board.doc).byteLength - 256
      )
    );
    const before = Y.encodeStateAsUpdate(board.doc);
    expect(before.byteLength).toBeLessThanOrEqual(WHITEBOARD_LIMITS.documentBytes);
    expect(() =>
      board.submit(
        [{ type: "edit_title", edit: { offset: 0, remove: 0, text: "x".repeat(1024) } }],
        {}
      )
    ).toThrow("预算");
    expect(Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(board.doc)), Buffer.from(before))).toBe(
      0
    );
  });
  it("两端各自合法但合并超页额度时拒绝候选，不能裁剪任一端的页", async () => {
    const { board } = await fixture();
    board.submit(
      Array.from({ length: WHITEBOARD_LIMITS.pages - 3 }, () => ({
        type: "create_page",
        title: "页",
      })),
      "seed"
    );
    const peer = model(Y.encodeStateAsUpdate(board.doc));
    board.submit([{ type: "create_page", title: "甲" }], {});
    peer.submit([{ type: "create_page", title: "乙" }], {});
    const before = Y.encodeStateAsUpdate(board.doc);
    await expect(board.receive(Y.encodeStateAsUpdate(peer.doc))).rejects.toThrow("预算");
    expect(Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(board.doc)), Buffer.from(before))).toBe(
      0
    );
    expect(board.read().pages).toHaveLength(64);
    expect(peer.read().pages).toHaveLength(64);
  });
  it("64 层可读；本地第 65 层及过深子树移动拒绝；并发合成深链只恢复投影", async () => {
    const { board, page, container } = await fixture();
    const chains: string[][] = [];
    for (let chain = 0; chain < 3; chain++) {
      const ids: string[] = [];
      for (let depth = 0; depth < 30; depth++)
        ids.push(
          create(board, container, depth ? elementParent(ids[depth - 1]) : pageParent(page))
        );
      chains.push(ids);
    }
    const peer = model(Y.encodeStateAsUpdate(board.doc));
    board.submit(
      [{ type: "move_node", id: chains[0][0], parent: elementParent(chains[1][29]) }],
      {}
    );
    peer.submit(
      [{ type: "move_node", id: chains[1][0], parent: elementParent(chains[2][29]) }],
      {}
    );
    await converge([board, peer]);
    const before = Y.encodeStateAsUpdate(board.doc);
    expect(board.read()).toEqual(peer.read());
    const visible = flat(board.read());
    expect(visible).toHaveLength(90);
    expect(new Set(visible.map(node => node.id)).size).toBe(90);
    expect(board.read().pages[0].recovery.some(node => node.recoveryReason === "depth")).toBe(true);
    expect(Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(board.doc)), Buffer.from(before))).toBe(
      0
    );
    const independent = await fixture();
    let parent = pageParent(independent.page);
    for (let depth = 0; depth < 64; depth++)
      parent = elementParent(create(independent.board, independent.container, parent));
    const extra = create(independent.board, independent.container, pageParent(independent.page));
    const boundary = Y.encodeStateAsUpdate(independent.board.doc);
    expect(() => independent.board.submit([{ type: "move_node", id: extra, parent }], {})).toThrow(
      "层级"
    );
    expect(() => create(independent.board, independent.container, parent)).toThrow("层级");
    expect(Y.encodeStateAsUpdate(independent.board.doc)).toEqual(boundary);
  });
  it("几何非有限、负尺寸、非法 JSON、路径命令和文本整段补丁均零写入", async () => {
    const { board, page, shape } = await fixture(),
      target = create(board, shape, pageParent(page));
    const invalid: unknown[] = [
      { type: "set_node", id: target, patch: { geometry: { ...shapeGeometry, x: Infinity } } },
      { type: "set_node", id: target, patch: { geometry: { ...shapeGeometry, width: -1 } } },
      { type: "set_data", id: target, patch: { value: undefined } },
      { type: "set_data", id: target, patch: { source: "覆盖" } },
      { type: "set_data", id: target, patch: { value: 1 }, unset: ["value"] },
      { type: "move_node", id: target, path: [0], newPath: [1] },
      {
        type: "create",
        contractId: shape,
        data: [],
        geometry: shapeGeometry,
        parent: pageParent(page),
      },
    ];
    const before = Y.encodeStateAsUpdate(board.doc);
    for (const command of invalid)
      expect(() => board.submit([command as WhiteboardModelCommand], {})).toThrow();
    expect(Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(board.doc)), Buffer.from(before))).toBe(
      0
    );
  });
});
