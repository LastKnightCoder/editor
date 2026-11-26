import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { prepareWhiteboardContract } from "@tau/db-schema/content-contracts";
import {
  fixture,
  model,
  documents,
  create,
  shapeGeometry,
  pageParent,
  elementParent,
  flat,
} from "./whiteboard-test-utils";

afterEach(() => documents.splice(0).forEach(doc => doc.destroy()));

describe("白板结构增量与完整模型对账", () => {
  it("连续收纳移动遇到重复目标、历史锚点和父级切换时，与逐条提交顺序及撤销一致", async () => {
    const { board, page, secondPage, container, shape } = await fixture();
    board.doc.gc = false;
    const parent = create(board, container, pageParent(page)),
      anchor = create(board, container, pageParent(page));
    const leaves = Array.from({ length: 5 }, () =>
      create(board, shape, elementParent(parent), "seed", "保留正文")
    );
    // 先留下失效顺序引用，后续锚点必须定位当前有效身份。
    board.submit(
      [
        { type: "move_node", id: anchor, parent: pageParent(secondPage) },
        { type: "move_node", id: anchor, parent: pageParent(page) },
      ],
      "seed"
    );
    const before = board.read(),
      expected = model(Y.encodeStateAsUpdate(board.doc)),
      record = board.elements.get(leaves[0]),
      body = board.text(leaves[0]),
      origin = {},
      history = board.createUndoManager({ trackedOrigins: new Set([origin]) });
    const commands: import("./whiteboard-types").WhiteboardModelCommand[] = [
      ...[leaves[0], leaves[1], leaves[0], leaves[2]].map(id => ({
        type: "move_node" as const,
        id,
        parent: pageParent(page),
        beforeId: anchor,
      })),
      { type: "set_node", id: anchor, patch: { geometry: { ...shapeGeometry, x: 30 } } },
      { type: "move_node", id: leaves[3], parent: pageParent(secondPage) },
      {
        type: "move_node",
        id: leaves[4],
        parent: pageParent(secondPage),
        beforeId: leaves[3],
      },
    ];
    expected.submit(commands, origin);
    board.prepareLocalTranslations();
    expect(board.tryLocalStructure(commands, origin)?.isolated).toBe(true);
    expect(board.read()).toEqual(expected.read());
    expect(board.read().pages[0].children.map(node => node.id)).toEqual([
      parent,
      leaves[1],
      leaves[0],
      leaves[2],
      anchor,
    ]);
    expect(board.read().pages[1].children.map(node => node.id)).toEqual([leaves[4], leaves[3]]);
    const committed = board.read();
    history.undo();
    expect(board.read()).toEqual(before);
    history.redo();
    expect(board.read()).toEqual(committed);
    expect(board.elements.get(leaves[0])).toBe(record);
    expect(board.text(leaves[0])).toBe(body);
    expect(body.toString()).toBe("保留正文");
    history.destroy();
  });

  it("批量移动与远端的归属和正文编辑并发时，合并及撤销重做不丢元素或文字", async () => {
    const { board, page, secondPage, container, shape } = await fixture();
    board.doc.gc = false;
    const parent = create(board, container, pageParent(page)),
      leaves = Array.from({ length: 3 }, () =>
        create(board, shape, elementParent(parent), "seed", "原文")
      ),
      peer = model(Y.encodeStateAsUpdate(board.doc)),
      origin = {},
      history = board.createUndoManager({ trackedOrigins: new Set([origin]) });
    peer.submit(
      [
        { type: "move_node", id: leaves[0], parent: pageParent(secondPage) },
        {
          type: "edit_text",
          id: leaves[1],
          field: null,
          edit: { offset: 2, remove: 0, text: "并发编辑" },
        },
      ],
      {}
    );
    board.prepareLocalTranslations();
    expect(
      board.tryLocalStructure(
        leaves.map(id => ({ type: "move_node", id, parent: pageParent(page) })),
        origin
      )?.isolated
    ).toBe(true);
    await board.receive(Y.encodeStateAsUpdate(peer.doc));
    await peer.receive(Y.encodeStateAsUpdate(board.doc));
    expect(board.read()).toEqual(peer.read());
    for (const change of [() => history.undo(), () => history.redo()]) {
      change();
      await peer.receive(Y.encodeStateAsUpdate(board.doc));
      expect(board.read()).toEqual(peer.read());
      expect(
        flat(board.read())
          .map(node => node.id)
          .sort()
      ).toEqual([parent, ...leaves].sort());
      expect(board.text(leaves[1]).toString()).toBe("原文并发编辑");
    }
    history.destroy();
  });

  it("多页容器反复创建收纳与解散后，增量快照和远端完整校验逐批一致", async () => {
    const { board, page, secondPage, rich, container } = await fixture();
    board.doc.gc = false;
    const titled = await prepareWhiteboardContract("example", {
      type: "titled",
      dataVersion: 1,
      structure: { container: "free" },
      collaboration: { textFields: ["title"] },
    });
    await board.installContracts({ [titled.id]: titled.contract });
    const parent = create(board, container, pageParent(page));
    const leaf = create(board, rich, elementParent(parent), "seed", [
      { type: "paragraph", collabId: "stable-body", children: [{ text: "跨容器保留正文" }] },
    ]);
    const record = board.elements.get(leaf),
      body = board.richText(leaf);
    const peer = model(Y.encodeStateAsUpdate(board.doc));
    board.prepareLocalTranslations();
    for (let round = 0; round < 24; round++) {
      const id = "temporary-" + round,
        destination = round % 2 ? page : secondPage;
      const result = board.tryLocalStructure(
        [
          {
            type: "create",
            id,
            contractId: titled.id,
            parent: pageParent(destination),
            geometry: shapeGeometry,
            data: { title: "容器 " + round },
          },
          { type: "move_node", id: leaf, parent: elementParent(id) },
          { type: "move_node", id, parent: elementParent(parent) },
          { type: "move_node", id: leaf, parent: pageParent(destination) },
        ],
        {},
        [],
        (trial, ids) => {
          expect(ids).toEqual([id]);
          expect(trial.readElementData(id)?.data.title).toBe("容器 " + round);
        }
      );
      expect(result?.isolated).toBe(true);
      await peer.receive(Y.encodeStateAsUpdate(board.doc));
      expect(board.read()).toEqual(peer.read());
      expect(board.tryLocalStructure([{ type: "remove_nodes", ids: [id] }], {})?.isolated).toBe(
        true
      );
      expect(
        board.tryLocalGeometries([{ id: leaf, geometry: { ...shapeGeometry, x: round * 3 } }], {})
          ?.isolated
      ).toBe(true);
      await peer.receive(Y.encodeStateAsUpdate(board.doc));
      expect(board.read()).toEqual(peer.read());
    }
    expect(board.elements.get(leaf)).toBe(record);
    expect(board.richText(leaf)).toBe(body);
  });

  it("结构草稿允许 64 层，环及第 65 层在整批写入前拒绝", async () => {
    const { board, page, container } = await fixture();
    board.doc.gc = false;
    board.prepareLocalTranslations();
    const commands: import("./whiteboard-types").WhiteboardModelCommand[] = [];
    for (let index = 0; index < 64; index++) {
      commands.push({
        type: "create",
        id: "depth-" + index,
        contractId: container,
        parent: pageParent(page),
        geometry: shapeGeometry,
        data: {},
      });
      if (index)
        commands.push({
          type: "move_node",
          id: "depth-" + index,
          parent: elementParent("depth-" + (index - 1)),
        });
    }
    expect(board.tryLocalStructure(commands, {})?.isolated).toBe(true);
    expect(board.read()).toEqual(model(Y.encodeStateAsUpdate(board.doc)).read());
    const before = Y.encodeStateAsUpdate(board.doc);
    expect(() =>
      board.tryLocalStructure(
        [{ type: "move_node", id: "depth-0", parent: elementParent("depth-63") }],
        {}
      )
    ).toThrow("循环");
    expect(() =>
      board.tryLocalStructure(
        [
          {
            type: "create",
            id: "depth-overflow",
            contractId: container,
            parent: pageParent(page),
            geometry: shapeGeometry,
            data: {},
          },
          { type: "move_node", id: "depth-overflow", parent: elementParent("depth-63") },
        ],
        {}
      )
    ).toThrow("层级");
    expect(Y.encodeStateAsUpdate(board.doc)).toEqual(before);
  });
  it("增量结构草稿与独立完整模型一致，坏批次和校验重入均零写入", async () => {
    const { board, page, secondPage, container, rich } = await fixture();
    board.doc.gc = false;
    const parent = create(board, container, pageParent(page));
    const child = create(board, rich, elementParent(parent), "seed", [
      { type: "paragraph", collabId: "body", children: [{ text: "保留正文" }] },
    ]);
    const anchor = create(board, container, pageParent(secondPage));
    const untouched = create(board, container, pageParent(page));
    board.prepareLocalTranslations();
    const before = board.read(),
      stable = flat(before).find(node => node.id === untouched);
    const origin = {},
      history = board.createUndoManager({ trackedOrigins: new Set([origin]) });
    const result = board.tryLocalStructure(
      [
        {
          type: "create",
          id: "new-frame",
          contractId: container,
          parent: pageParent(secondPage),
          geometry: shapeGeometry,
          data: {},
        },
        { type: "move_node", id: parent, parent: elementParent("new-frame") },
        { type: "move_node", id: child, parent: pageParent(secondPage), beforeId: anchor },
        { type: "set_node", id: child, patch: { geometry: { ...shapeGeometry, x: 42 } } },
      ],
      origin
    );
    expect(result).toMatchObject({ isolated: true, createdIds: ["new-frame"] });
    const committed = board.read(),
      independent = model(Y.encodeStateAsUpdate(board.doc));
    expect(committed).toEqual(independent.read());
    expect(flat(committed).find(node => node.id === untouched)).toBe(stable);
    expect(flat(committed).find(node => node.id === child)?.body).toEqual(
      flat(before).find(node => node.id === child)?.body
    );
    const vector = Y.encodeStateAsUpdate(board.doc),
      length = history.undoStack.length;
    for (const bad of [
      { type: "move_node" as const, id: "new-frame", parent: elementParent(parent) },
      { type: "move_node" as const, id: child, parent: pageParent(page), beforeId: anchor },
      { type: "upgrade_column" as const, id: parent, contractId: container },
    ]) {
      expect(() =>
        board.tryLocalStructure(
          [{ type: "set_node", id: child, patch: { geometry: shapeGeometry } }, bad],
          origin
        )
      ).toThrow();
      expect(Y.encodeStateAsUpdate(board.doc)).toEqual(vector);
      expect(history.undoStack).toHaveLength(length);
    }
    expect(() =>
      board.tryLocalStructure(
        [
          {
            type: "create",
            id: "bad",
            contractId: container,
            parent: pageParent(page),
            geometry: shapeGeometry,
            data: {},
          },
        ],
        origin,
        [],
        trial => trial.title.insert(0, "不允许")
      )
    ).toThrow();
    expect(Y.encodeStateAsUpdate(board.doc)).toEqual(vector);
    history.undo();
    expect(board.read()).toEqual(before);
    history.redo();
    expect(board.read()).toEqual(committed);
    history.destroy();
  });

  it("结构变更观察者附加写入后放弃增量证明，后续读取包含真实变化", async () => {
    const { board, page, secondPage, container } = await fixture();
    board.doc.gc = false;
    const target = create(board, container, pageParent(page));
    board.prepareLocalTranslations();
    board.doc.once("update", () => board.title.insert(0, "观察者"));
    expect(
      board.tryLocalStructure(
        [{ type: "move_node", id: target, parent: pageParent(secondPage) }],
        {}
      )
    ).toMatchObject({ isolated: false });
    expect(board.readIncrementalSnapshot()).toBeUndefined();
    expect(board.read()).toEqual(model(Y.encodeStateAsUpdate(board.doc)).read());
  });
});
