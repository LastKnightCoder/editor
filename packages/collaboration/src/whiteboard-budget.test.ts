import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
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
