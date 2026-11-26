import { afterEach, expect, it } from "vitest";
import * as Y from "yjs";
import { getDefaultHandwriteStyle } from "../../utils/HandwriteUtil";
import { FrameUtil } from "../../utils/FrameUtil";
import { BoardUtil } from "../../utils/BoardUtil";
import { deleteBoardElements } from "../../utils/SelectionActionUtil";
import type { Operation } from "../../types";

import { createRemovalFixture } from "./removal-fixture";
import { prepareWhiteboardContract } from "@tau/db-schema/content-contracts";

const cleanup: (() => void)[] = [];
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach(dispose => dispose())
);
async function setup(state?: Uint8Array) {
  const f = await createRemovalFixture(state);
  cleanup.push(f.dispose);
  return f;
}

// 事故：删除手写只删除投影中的主体，隐藏分段变成恢复区的“缺少扩展”节点。
it.each(["Delete", "Backspace", "cut", "menu"])(
  "%s 删除整笔并可完整撤销、重做和重开",
  async action => {
    const f = await setup();
    f.stroke("ink");
    const before = f.model.read();
    const ink = f.board.children[0];
    f.board.apply(
      {
        type: "set_selection",
        properties: f.board.selection,
        newProperties: { selectedElements: [ink], selectArea: null },
      },
      false
    );
    f.binding.splitHistory();
    if (action === "cut") {
      const event = new Event("cut", { cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: { setData: () => undefined } });
      f.board.onCut(event as ClipboardEvent);
    } else if (action === "menu") {
      const context = {
        board: f.board,
        clientX: 0,
        clientY: 0,
        viewPortPoint: { x: 0, y: 0 },
        selectedElements: [ink],
        hitElements: [ink],
        targetElements: [ink],
        isHitSelected: true,
      };
      const item = f.board.getContextMenu(context).find(item => item.key === "delete");
      if (!item) throw new Error("删除菜单不存在");
      await item.onSelect(context);
    } else {
      const code = action === "Delete" ? 46 : 8;
      f.board.onKeyDown(
        new KeyboardEvent("keydown", { key: action, keyCode: code, which: code, cancelable: true })
      );
    }
    expect(f.model.read().pages[0].recovery).toEqual([]);
    expect(f.board.children).toEqual([]);
    const reopened = await setup(Y.encodeStateAsUpdate(f.doc));
    expect(reopened.board.children).toEqual([]);
    f.binding.undo();
    expect(f.model.read()).toEqual(before);
    expect(f.board.children[0].points).toEqual(ink.points);
    f.binding.redo();
    expect(f.board.children).toEqual([]);
    expect(f.model.read().pages[0].recovery).toEqual([]);
  }
);

it.each(["host", "author"])(
  "%s 同批移出、移入后删除容器只删除当时仍归属它的完整子树",
  async entry => {
    const f = await setup();
    f.insert({ ...FrameUtil.createFrame(0, 0, 600, 500), id: "frame" });
    f.stroke("out");
    f.stroke("in");
    f.binding.submit([{ type: "move_node", id: "out", parent: { kind: "element", id: "frame" } }]);
    const before = f.model.read();
    f.binding.splitHistory();
    if (entry === "author")
      f.binding.author.submit("test", [
        { type: "move_node", id: "out", parent: { kind: "page", id: "page" } },
        { type: "move_node", id: "in", parent: { kind: "element", id: "frame" } },
        { type: "remove_nodes", ids: ["frame"] },
      ]);
    else {
      const operations: Operation[] = [
        { type: "move_node", path: [0, 0], newPath: [2] },
        { type: "move_node", path: [1], newPath: [0, 0] },
        { type: "remove_node", path: [0], node: f.board.children[0] },
      ];
      BoardUtil.normalizeOperations(operations);
      f.board.apply(operations);
    }
    expect(f.model.read().pages[0].recovery).toEqual([]);
    expect(f.board.children.map(node => node.id)).toEqual(["out"]);
    expect(f.board.children[0].points).toHaveLength(4);
    f.binding.undo();
    expect(f.model.read()).toEqual(before);
    f.binding.redo();
    expect(f.board.children.map(node => node.id)).toEqual(["out"]);
  }
);

it("同批先删除一个孩子再删除父容器不重复删除已移除的节点", async () => {
  const f = await setup();
  f.insert({ ...FrameUtil.createFrame(0, 0, 600, 500), id: "frame" });
  f.stroke("ink");
  f.binding.submit([{ type: "move_node", id: "ink", parent: { kind: "element", id: "frame" } }]);
  f.binding.author.submit("test", [
    { type: "remove_nodes", ids: ["ink"] },
    { type: "remove_nodes", ids: ["frame"] },
  ]);
  expect(f.board.children).toEqual([]);
  expect(f.model.read().pages[0].recovery).toEqual([]);
});

it("同批新建容器并收纳后删除可完整撤销，不留下隐藏节点", async () => {
  const f = await setup();
  f.stroke("ink");
  const before = f.model.read();
  const frame = { ...FrameUtil.createFrame(0, 0, 600, 500), id: "frame" };
  const operations: Operation[] = [
    { type: "insert_node", path: [1], node: frame },
    { type: "move_node", path: [0], newPath: [1, 0] },
    { type: "remove_node", path: [0], node: frame },
  ];
  BoardUtil.normalizeOperations(operations);
  f.board.apply(operations);
  expect(f.board.children).toEqual([]);
  expect(f.model.read().pages[0].recovery).toEqual([]);
  f.binding.undo();
  expect(f.model.read()).toEqual(before);
});

it.each([false, true])("连续手势中先删孩子再删容器保持完整事务，提交=%s", async commit => {
  const f = await setup();
  f.insert({ ...FrameUtil.createFrame(0, 0, 600, 500), id: "frame" });
  f.stroke("ink");
  f.binding.submit([{ type: "move_node", id: "ink", parent: { kind: "element", id: "frame" } }]);
  const before = f.model.read();
  f.binding.beginGesture();
  const child = f.board.children[0].children?.[0];
  if (!child) throw new Error("画框内缺少待删除笔迹");
  f.board.apply({ type: "remove_node", path: [0, 0], node: child });
  f.board.apply({ type: "remove_node", path: [0], node: f.board.children[0] });
  f.binding.endGesture(commit);
  expect(f.model.read().pages[0].recovery).toEqual([]);
  if (commit) expect(f.board.children).toEqual([]);
  else expect(f.model.read()).toEqual(before);
});

it("整笔删除与离线追加并发时保留追加数据，存储分段不作为独立元素出现", async () => {
  const local = await setup();
  local.stroke("ink", 1);
  const peer = await setup(Y.encodeStateAsUpdate(local.doc));
  peer.binding.appendStroke(
    "ink",
    [
      { x: 200, y: 100, pressure: 0.5 },
      { x: 230, y: 150, pressure: 0.5 },
    ],
    getDefaultHandwriteStyle()
  );
  const appended = peer.model.read().pages[0].children[0].children.at(-1);
  if (!appended) throw new Error("未生成并发追加分段");
  deleteBoardElements(local.board, local.board.children);
  await local.model.receive(Y.encodeStateAsUpdate(peer.doc));
  await peer.model.receive(Y.encodeStateAsUpdate(local.doc));
  expect(local.model.read()).toEqual(peer.model.read());
  expect(local.model.read().pages[0].recovery.map(node => node.id)).toEqual([appended.id]);
  expect(local.board.children).toEqual([]);
  expect(peer.board.children).toEqual([]);
  const reopened = await setup(Y.encodeStateAsUpdate(local.doc));
  expect(reopened.model.read()).toEqual(local.model.read());
  expect(reopened.board.children).toEqual([]);
  local.binding.undo();
  expect(local.board.children[0].points).toHaveLength(4);
  expect(local.model.read().pages[0].recovery).toEqual([]);
});

it("同名第三方契约保持未知元素投影，不被当作内置存储分段隐藏", async () => {
  const f = await setup();
  const foreign = await prepareWhiteboardContract("example.foreign", {
    type: "host.whiteboard.stroke-segment",
    dataVersion: 1,
  });
  f.model.submit(
    [
      {
        type: "create",
        id: "foreign",
        contractId: foreign.id,
        parent: { kind: "page", id: "page" },
        geometry: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
        data: {},
      },
    ],
    null,
    [foreign]
  );
  expect(f.board.children.map(node => node.id)).toEqual(["foreign"]);
  expect(f.board.extensions?.unknownElementReason(f.board.children[0])?.reason).toBe("missing");
});

it("批量删除后的非法移动拒绝整个批次，笔迹与历史均不改变", async () => {
  const f = await setup();
  f.stroke("ink");
  f.insert({ ...FrameUtil.createFrame(0, 0, 600, 500), id: "frame" });
  const before = Y.encodeStateAsUpdate(f.doc);
  const history = f.binding.history.undoStack.length;
  expect(() =>
    f.binding.author.submit("test", [
      { type: "remove_nodes", ids: ["ink"] },
      { type: "move_node", id: "frame", parent: { kind: "element", id: "missing" } },
    ])
  ).toThrow();
  expect(Y.encodeStateAsUpdate(f.doc)).toEqual(before);
  expect(f.binding.history.undoStack).toHaveLength(history);
  expect(f.board.children.find(node => node.id === "ink")?.points).toHaveLength(4);
});
