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
