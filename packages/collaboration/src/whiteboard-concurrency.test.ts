import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  fixture,
  model,
  documents,
  create,
  pageParent,
  elementParent,
  flat,
  converge,
  changes,
} from "./whiteboard-test-utils";

afterEach(() => documents.splice(0).forEach(doc => doc.destroy()));

describe("白板双端冲突与恢复", () => {
  it("同元素双端换父/换页只出现一次，文字输入都保留", async () => {
    const { board, page, secondPage, shape, container } = await fixture();
    const parent = create(board, container, pageParent(page)),
      target = create(board, shape, pageParent(page));
    const peer = model(Y.encodeStateAsUpdate(board.doc));
    board.submit(
      [
        { type: "move_node", id: target, parent: elementParent(parent) },
        {
          type: "edit_text",
          id: target,
          field: "source",
          edit: { offset: 0, remove: 0, text: "甲" },
        },
      ],
      {}
    );
    peer.submit(
      [
        { type: "move_node", id: target, parent: pageParent(secondPage) },
        {
          type: "edit_text",
          id: target,
          field: "source",
          edit: { offset: 0, remove: 0, text: "乙" },
        },
      ],
      {}
    );
    await converge([board, peer]);
    expect(board.read()).toEqual(peer.read());
    expect(flat(board.read()).filter(node => node.id === target)).toHaveLength(1);
    expect([...board.text(target, "source").toString()].sort()).toEqual(["乙", "甲"].sort());
  });
  for (const undoFirst of ["left", "right"] as const)
    it(`双删单撤仍隐藏，全部撤销才恢复合并内容：${undoFirst}`, async () => {
      const { board, page, shape } = await fixture(),
        target = create(board, shape, pageParent(page));
      const peer = model(Y.encodeStateAsUpdate(board.doc)),
        left = {},
        right = {};
      const leftHistory = board.createUndoManager({
        trackedOrigins: new Set([left]),
        captureTimeout: 0,
      });
      const rightHistory = peer.createUndoManager({
        trackedOrigins: new Set([right]),
        captureTimeout: 0,
      });
      const retained = board.text(target, "source");
      board.submit([{ type: "remove_nodes", ids: [target] }], left);
      peer.submit(
        [
          { type: "set_data", id: target, patch: { color: "blue" } },
          {
            type: "edit_text",
            id: target,
            field: "source",
            edit: { offset: 0, remove: 0, text: "保留" },
          },
        ],
        "other"
      );
      peer.submit([{ type: "remove_nodes", ids: [target] }], right);
      await converge([board, peer]);
      expect(flat(board.read())).toEqual([]);
      (undoFirst === "left" ? leftHistory : rightHistory).undo();
      await converge([board, peer]);
      expect(flat(board.read())).toEqual([]);
      (undoFirst === "left" ? rightHistory : leftHistory).undo();
      await converge([board, peer]);
      expect(board.text(target, "source")).toBe(retained);
      expect(retained.toString()).toBe("保留");
      expect(flat(board.read())[0].data.color).toBe("blue");
      expect(board.read()).toEqual(peer.read());
      leftHistory.redo();
      await converge([board, peer]);
      expect(flat(board.read())).toEqual([]);
      leftHistory.destroy();
      rightHistory.destroy();
    });
  it("父删子移仍删观察集合，新插入子节点则进入原页恢复区", async () => {
    const { board, page, secondPage, shape, container } = await fixture();
    const parent = create(board, container, pageParent(page)),
      child = create(board, shape, elementParent(parent));
    const peer = model(Y.encodeStateAsUpdate(board.doc));
    board.submit([{ type: "remove_nodes", ids: [parent, child] }], {});
    peer.submit([{ type: "move_node", id: child, parent: pageParent(secondPage) }], {});
    const newChild = create(peer, shape, elementParent(parent), {});
    await converge([board, peer]);
    expect(board.read()).toEqual(peer.read());
    expect(flat(board.read()).map(node => node.id)).toEqual([newChild]);
    expect(board.read().pages[0].recovery[0]).toMatchObject({
      id: newChild,
      recoveryReason: "parent-unavailable",
    });
  });
  it("删页与移入并发，集合外元素进入文档恢复区，不借用别的页", async () => {
    const { board, page, secondPage, shape } = await fixture();
    const original = create(board, shape, pageParent(page)),
      arriving = create(board, shape, pageParent(secondPage));
    const peer = model(Y.encodeStateAsUpdate(board.doc));
    board.submit([{ type: "remove_page", id: page, observedElementIds: [original] }], {});
    peer.submit([{ type: "move_node", id: arriving, parent: pageParent(page) }], {});
    await converge([board, peer]);
    const state = board.read();
    expect(state).toEqual(peer.read());
    expect(state.pages.map(page => page.id)).toEqual([secondPage]);
    expect(state.pages[0].children).toEqual([]);
    expect(state.recovery[0].id).toBe(arriving);
    board.submit([{ type: "move_node", id: arriving, parent: pageParent(secondPage) }], {});
    expect(board.read().recovery).toEqual([]);
    expect(board.read().pages[0].children[0].id).toBe(arriving);
  });
  it("真实页归属从父链推导，移动容器不让子节点的旧 fallback 决定所在页", async () => {
    const { board, page, secondPage, shape, container } = await fixture();
    const parent = create(board, container, pageParent(page)),
      child = create(board, shape, elementParent(parent));
    board.submit([{ type: "move_node", id: parent, parent: pageParent(secondPage) }], {});
    expect(board.read().pages[0].children).toEqual([]);
    expect(board.read().pages[1].children[0].children[0].id).toBe(child);
    const newChild = create(board, shape, elementParent(parent));
    expect(
      (board.elements.get(newChild)!.get("placement") as { fallbackPageId: string }).fallbackPageId
    ).toBe(secondPage);
  });
  it("互相移入按最小身份断环，读取零写入，恢复一项不改无关恢复根", async () => {
    const { board, page, container } = await fixture();
    const a = create(board, container, pageParent(page)),
      b = create(board, container, pageParent(page));
    const unrelatedParent = create(board, container, pageParent(page)),
      unrelated = create(board, container, elementParent(unrelatedParent));
    board.submit([{ type: "remove_nodes", ids: [unrelatedParent] }], {});
    const peer = model(Y.encodeStateAsUpdate(board.doc));
    board.submit([{ type: "move_node", id: a, parent: elementParent(b) }], {});
    peer.submit([{ type: "move_node", id: b, parent: elementParent(a) }], {});
    await converge([board, peer]);
    const before = Y.encodeStateAsUpdate(board.doc),
      state = board.read();
    expect(state).toEqual(peer.read());
    expect(flat(state)).toHaveLength(3);
    const cut = [a, b].sort()[0];
    expect(state.pages[0].recovery.find(node => node.id === cut)?.recoveryReason).toBe("cycle");
    expect(Y.encodeStateAsUpdate(board.doc)).toEqual(before);
    const placement = structuredClone(board.elements.get(unrelated)!.get("placement"));
    board.submit([{ type: "move_node", id: cut, parent: pageParent(page) }], {});
    expect(board.read().pages[0].recovery.map(node => node.id)).toEqual([unrelated]);
    expect(board.elements.get(unrelated)!.get("placement")).toEqual(placement);
  });
  it("同锚点并发插入和页面重排保留全部身份，陈旧位置不重复投影", async () => {
    const { board, page, shape } = await fixture(),
      target = create(board, shape, pageParent(page));
    const peer = model(Y.encodeStateAsUpdate(board.doc));
    const left = create(board, shape, pageParent(page)),
      right = create(peer, shape, pageParent(page));
    board.submit([{ type: "move_node", id: left, parent: pageParent(page), beforeId: target }], {});
    peer.submit([{ type: "move_node", id: right, parent: pageParent(page), beforeId: target }], {});
    await converge([board, peer]);
    expect(board.read()).toEqual(peer.read());
    const ids = board.read().pages[0].children.map(node => node.id);
    expect(ids.slice(0, 2).sort()).toEqual([left, right].sort());
    expect(ids[2]).toBe(target);
    expect(ids).toHaveLength(3);
  });
});

const permutations = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];
describe("白板三端乱序与幂等", () => {
  for (const order of permutations)
    it(`三端移动成环、文字和删除在 ${order.join("→")} 乱序下不丢身份`, async () => {
      const { board, page, shape, container } = await fixture();
      const parents = [
        create(board, container, pageParent(page)),
        create(board, container, pageParent(page)),
        create(board, container, pageParent(page)),
      ];
      const text = create(board, shape, elementParent(parents[0])),
        removed = create(board, shape, pageParent(page));
      const baseline = Y.encodeStateAsUpdate(board.doc),
        clients = [model(baseline), model(baseline), model(baseline)];
      const updates = clients.map((client, index) => {
        const move = changes(
          client,
          [
            {
              type: "move_node",
              id: parents[index],
              parent: elementParent(parents[(index + 1) % 3]),
            },
          ],
          {}
        );
        const edit = changes(
          client,
          [
            {
              type: "edit_text",
              id: text,
              field: "source",
              edit: { offset: 0, remove: 0, text: String(index) },
            },
            { type: "remove_nodes", ids: [removed] },
          ],
          {}
        );
        return [move, edit];
      });
      const receiver = model(baseline),
        before = Y.encodeStateAsUpdate(receiver.doc);
      for (const index of order)
        expect(await receiver.receive(updates[index][1])).toEqual({ status: "pending" });
      expect(Y.encodeStateAsUpdate(receiver.doc)).toEqual(before);
      for (const index of [...order].reverse()) await receiver.receive(updates[index][0]);
      for (const index of order) {
        await receiver.receive(updates[index][0]);
        await receiver.receive(updates[index][1]);
      }
      await converge([...clients, receiver]);
      for (const client of clients) expect(client.read()).toEqual(receiver.read());
      const projected = flat(receiver.read());
      expect(projected).toHaveLength(4);
      expect(new Set(projected.map(node => node.id)).size).toBe(4);
      expect(projected.some(node => node.id === removed)).toBe(false);
      expect([...receiver.text(text, "source").toString()].sort()).toEqual(["0", "1", "2"]);
      expect(receiver.read().pages[0].recovery[0]).toMatchObject({
        id: [...parents].sort()[0],
        recoveryReason: "cycle",
      });
    });
});
