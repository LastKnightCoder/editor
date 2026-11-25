import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { WhiteboardModel, WHITEBOARD_LIMITS } from "@tau/collaboration";
import {
  prepareWhiteboardContract,
  prepareContentContract,
} from "@tau/db-schema/content-contracts";
import Board from "../Board";
import { FramePlugin } from "../plugins/FramePlugin";
import { createWhiteboardBinding } from "../collaboration/binding";
import { prepareBuiltinWhiteboardTypes } from "../collaboration/builtins";
import {
  createStandardWhiteboardExtensions,
  createDocumentExtension,
} from "../extensions/builtins";
import { frameCreateGesture } from "../extensions/creators/frame";
import { FrameUtil } from "../utils/FrameUtil";
import { ColumnUtil } from "../utils/ColumnUtil";
import { PathUtil } from "../utils/PathUtil";
import type { BoardElement, Operation } from "../types";

const cleanups: (() => void)[] = [];
afterEach(() => {
  vi.useRealTimers();
  cleanups
    .splice(0)
    .reverse()
    .forEach(fn => fn());
});
const geometry = { x: 120, y: 140, width: 80, height: 50, rotation: 0 };
async function setup() {
  const model = new WhiteboardModel(new Y.Doc({ gc: false }));
  model.submit([{ type: "create_page", id: "page", title: "画框" }], null);
  const schema = await prepareBuiltinWhiteboardTypes();
  const board = new Board(
    [],
    { minX: 0, minY: 0, width: 1000, height: 700, zoom: 1 },
    { selectedElements: [], selectArea: null }
  );
  board.installExtensions([
    ...createStandardWhiteboardExtensions(),
    createDocumentExtension({ Body: () => null }),
  ]);
  const binding = createWhiteboardBinding(model, {
    pageId: "page",
    types: schema.types,
    preparedContracts: schema.prepared,
  });
  board.attachDocument(binding);
  cleanups.push(() => {
    board.destroy();
    model.dispose();
    model.doc.destroy();
  });
  const insert = (node: BoardElement) =>
    board.apply({ type: "insert_node", path: [board.children.length], node });
  return { model, board, binding, schema, insert };
}
const frame = (id = "frame") => ({ ...FrameUtil.createFrame(100, 100, 600, 500), id });
const card = (id: string) => ({ id, type: "document", ...geometry, title: id });
function getApi(board: Board) {
  if (!board.extensions) throw new Error("白板扩展未安装");
  return board.extensions.api;
}
async function capture(board: Board) {
  const api = getApi(board);
  const context = {
    api,
    start: { x: 100, y: 100 },
    point: { x: 650, y: 550 },
    shift: false,
    alt: false,
    zoom: 1,
    pressure: 0.5,
  };
  const session = frameCreateGesture.begin({ ...context, preview: () => undefined });
  if (!session) throw new Error("创建手势未开始");
  const result = await session.end({ ...context, moved: true });
  if (!result) throw new Error("创建没有产出");
  const { element, operations = [] } = "element" in result ? result : { element: result };
  board.apply([
    { type: "insert_node", path: [board.children.length], node: element },
    ...operations,
  ]);
  return element.id;
}
async function dissolve(board: Board, id: string) {
  const node = board.children.find(node => node.id === id);
  if (!node) throw new Error("画框不存在");
  const menu = new FramePlugin().getContextMenu({
    board,
    targetElements: [node],
    selectedElements: [node],
    hitElements: [node],
    viewPortPoint: { x: 0, y: 0 },
    clientX: 0,
    clientY: 0,
    isHitSelected: true,
  });
  const action = menu.find(item => item.key === "dissolve-frame")?.onSelect;
  if (!action) throw new Error("解散菜单不存在");
  await action({
    board,
    targetElements: [node],
    selectedElements: [node],
    hitElements: [node],
    viewPortPoint: { x: 0, y: 0 },
    clientX: 0,
    clientY: 0,
    isHitSelected: true,
  });
}
// 事故：圈住已有内容重复 create；解散又可能按旧快照删除已移出的孩子。
it("新建收纳与解散保留已有记录和文字身份，撤销重做只改变归属", async () => {
  const { model, board, binding, insert } = await setup();
  insert(card("a"));
  insert(card("b"));
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  await model.installContracts({ [paragraph.id]: paragraph.contract });
  insert({
    id: "rich",
    type: "richtext",
    ...geometry,
    maxWidth: 80,
    maxHeight: 200,
    resized: true,
    readonly: false,
    content: [{ type: "paragraph", tauContract: paragraph.id, children: [{ text: "原有正文" }] }],
  });
  const body = model.richText("rich"),
    paragraphId = body.read()[0].collabId;
  if (typeof paragraphId !== "string") throw new Error("正文缺少稳定身份");
  const content = body.content(paragraphId);
  const record = model.elements.get("a"),
    text = model.text("a", "title");
  const id = await capture(board);
  expect(board.children.map(node => node.id)).toEqual([id]);
  expect(board.children[0].children?.map(node => node.id)).toEqual(["a", "b", "rich"]);
  expect(model.elements.get("a")).toBe(record);
  expect(model.text("a", "title")).toBe(text);
  binding.undo();
  expect(board.children.map(node => node.id)).toEqual(["a", "b", "rich"]);
  binding.redo();
  await dissolve(board, id);
  expect(board.children.map(node => node.id)).toEqual(["a", "b", "rich"]);
  expect(model.text("a", "title").toString()).toBe("a");
  binding.undo();
  expect(board.children[0].children?.map(node => node.id)).toEqual(["a", "b", "rich"]);
  binding.redo();
  expect(model.elements.get("a")).toBe(record);
  expect(model.richText("rich")).toBe(body);
  expect(body.content(paragraphId)).toBe(content);
  expect(content.toString()).toBe("原有正文");
});

it("超过单批的移动与解散整体提交，最后一项非法时没有部分写入或历史", async () => {
  const { model, board, binding, schema, insert } = await setup();
  insert(frame());
  const count = WHITEBOARD_LIMITS.commandsPerBatch + 1;
  model.submitChunks(
    Array.from({ length: count }, (_, i) => ({
      type: "create" as const,
      id: `c-${i}`,
      contractId: schema.types.document.contractId,
      parent: { kind: "element" as const, id: "frame" },
      geometry,
      data: { title: `c-${i}` },
    })),
    null,
    schema.prepared
  );
  const peer = new WhiteboardModel(new Y.Doc({ gc: false }));
  await peer.receive(Y.encodeStateAsUpdate(model.doc));
  cleanups.push(() => {
    peer.dispose();
    peer.doc.destroy();
  });
  const before = model.read(),
    state = Y.encodeStateVector(model.doc);
  const history = binding.history.undoStack.length;
  const ops: Operation[] = Array.from({ length: count }, (_, i) => ({
    type: "set_node",
    path: [0, i],
    properties: {},
    newProperties: { x: 300 },
  }));
  expect(() =>
    board.apply([
      ...ops,
      { type: "set_node", path: [0], properties: {}, newProperties: { width: -1 } },
    ])
  ).toThrow();
  expect(model.read()).toEqual(before);
  expect(Y.encodeStateVector(model.doc)).toEqual(state);
  expect(binding.history.undoStack).toHaveLength(history);
  board.apply(ops);
  expect(board.children[0].children?.every(node => node.x === 300)).toBe(true);
  await peer.receive(Y.encodeStateAsUpdate(model.doc));
  expect(peer.read()).toEqual(model.read());
  binding.undo();
  expect(model.read()).toEqual(before);
  binding.redo();
  await dissolve(board, "frame");
  expect(new Set(board.children.map(node => node.id))).toEqual(
    new Set(Array.from({ length: count }, (_, i) => `c-${i}`))
  );
  await peer.receive(Y.encodeStateAsUpdate(model.doc));
  expect(peer.read()).toEqual(model.read());
  binding.undo();
  expect(board.children[0].children).toHaveLength(count);
  await peer.receive(Y.encodeStateAsUpdate(model.doc));
  expect(peer.read()).toEqual(model.read());
});

it("旧分栏入框升级保留标题根，远端和重开能接纳，撤销能回到旧契约", async () => {
  const { model, board, binding, schema, insert } = await setup();
  const legacy = await prepareWhiteboardContract("host.whiteboard", {
    type: "column",
    dataVersion: 1,
    collaboration: { textFields: ["title"] },
    structure: { container: "layout", canBeContained: false },
  });
  await model.installContracts({ [legacy.id]: legacy.contract });
  model.submit(
    [
      {
        type: "create",
        id: "column",
        contractId: legacy.id,
        parent: { kind: "page", id: "page" },
        geometry,
        data: { title: "原来的分栏", padding: 8, gap: 8, minWidth: 200, maxWidth: 600 },
      },
    ],
    null
  );
  insert(frame());
  const forged = new WhiteboardModel(new Y.Doc({ gc: false }));
  Y.applyUpdate(forged.doc, Y.encodeStateAsUpdate(model.doc));
  const forgedColumn = forged.elements.get("column");
  if (!forgedColumn) throw new Error("原分栏不存在");
  forgedColumn.set("identity", { type: "frame", contractId: schema.types.frame.contractId });
  await expect(forged.validate(model)).rejects.toThrow("身份");
  forged.dispose();
  forged.doc.destroy();
  const peer = new WhiteboardModel(new Y.Doc({ gc: false }));
  await peer.receive(Y.encodeStateAsUpdate(model.doc));
  cleanups.push(() => {
    peer.dispose();
    peer.doc.destroy();
  });
  const record = model.elements.get("column"),
    title = model.text("column", "title");
  peer.submit(
    [
      {
        type: "edit_text",
        id: "column",
        field: "title",
        edit: { offset: 0, remove: 0, text: "并发" },
      },
    ],
    {}
  );
  binding.beginGesture();
  board.apply({ type: "move_node", path: [0], newPath: [1, 0] });
  board.apply({ type: "move_node", path: [0, 0], newPath: [1] });
  board.apply({ type: "move_node", path: [1], newPath: [0, 0] });
  binding.endGesture(true);
  expect(board.children[0].children?.[0].id).toBe("column");
  expect(model.readElementIdentity("column")?.contractId).toBe(schema.types.column.contractId);
  expect(model.elements.get("column")).toBe(record);
  expect(model.text("column", "title")).toBe(title);
  await peer.receive(Y.encodeStateAsUpdate(model.doc));
  await model.receive(Y.encodeStateAsUpdate(peer.doc));
  expect(peer.read()).toEqual(model.read());
  binding.undo();
  expect(model.readElementIdentity("column")?.contractId).toBe(legacy.id);
  expect(model.text("column", "title").toString()).toBe("并发原来的分栏");
  await peer.receive(Y.encodeStateAsUpdate(model.doc));
  expect(peer.read()).toEqual(model.read());
  binding.redo();
  const reopened = new WhiteboardModel(new Y.Doc({ gc: false }));
  cleanups.push(() => {
    reopened.dispose();
    reopened.doc.destroy();
  });
  await reopened.receive(Y.encodeStateAsUpdate(model.doc));
  expect(reopened.read()).toEqual(model.read());
});

it("框内解散分栏把孩子留在原画框，保留身份并可撤销", async () => {
  const { board, binding, insert } = await setup();
  insert({
    ...frame(),
    children: [{ ...ColumnUtil.createColumn(150, 180), id: "column", children: [card("child")] }],
  });
  const column = PathUtil.getElementByPath(board, [0, 0]);
  ColumnUtil.dissolveColumn(board, column as Parameters<typeof ColumnUtil.dissolveColumn>[1]);
  expect(board.children).toHaveLength(1);
  expect(board.children[0].children?.map(node => node.id)).toEqual(["child"]);
  binding.undo();
  expect(board.children[0].children?.[0].children?.[0].id).toBe("child");
});

it("框内分栏优先接纳内容，拖出回到外框，整体移动不改变内部归属", async () => {
  const { board, binding, insert, model } = await setup();
  const { DraggingState } = await import("../interactions/states/DraggingState");
  const { BOARD_TO_CONTAINER } = await import("../constants/map");
  const host = document.createElement("div");
  host.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 700,
    width: 1000,
    height: 700,
    toJSON: () => ({}),
  });
  BOARD_TO_CONTAINER.set(board, host);
  insert({
    ...frame(),
    children: [{ ...ColumnUtil.createColumn(150, 180), id: "column", children: [card("child")] }],
  });
  insert({ ...card("outside"), x: 780, y: 250 });
  const locate = (id: string): BoardElement => {
    const visit = (nodes: BoardElement[]): BoardElement | undefined => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const child = visit(node.children ?? []);
        if (child) return child;
      }
    };
    const found = visit(board.children);
    if (!found) throw new Error("元素丢失");
    return found;
  };
  const drag = (id: string, endX: number, endY: number) => {
    const node = locate(id);
    const start = { x: node.x + 10, y: node.y + 10 };
    getApi(board).select([id]);
    const event = (x: number, y: number) =>
      new MouseEvent("pointermove", {
        clientX: x,
        clientY: y,
        button: 0,
        altKey: true,
      }) as PointerEvent;
    binding.beginGesture();
    const state = DraggingState.tryStart(board, event(start.x, start.y));
    if (!state) throw new Error("拖动未开始");
    state.onPointerMove(event(endX, endY), board);
    state.onPointerUp(event(endX, endY), board);
    binding.endGesture(true);
  };
  drag("outside", 220, 260);
  expect(locate("column").children?.some(node => node.id === "outside")).toBe(true);
  drag("outside", 520, 350);
  expect(locate("frame").children?.some(node => node.id === "outside")).toBe(true);
  expect(locate("column").children?.some(node => node.id === "outside")).toBe(false);
  const childRecord = model.elements.get("child");
  drag("frame", 210, 140);
  expect(locate("frame").children?.some(node => node.id === "column")).toBe(true);
  expect(locate("column").children?.map(node => node.id)).toEqual(["child"]);
  drag("column", 950, 200);
  expect(board.children.some(node => node.id === "column")).toBe(true);
  expect(model.elements.get("child")).toBe(childRecord);
  binding.undo();
  expect(locate("frame").children?.some(node => node.id === "column")).toBe(true);
  vi.useFakeTimers();
  const beforeCancel = model.read();
  const old = locate("outside");
  getApi(board).select(["outside"]);
  const pointer = (x: number, y: number) =>
    new MouseEvent("pointermove", {
      clientX: x,
      clientY: y,
      button: 0,
      altKey: true,
    }) as PointerEvent;
  board.interactions.tryStartPointerGesture(pointer(old.x + 10, old.y + 10));
  board.interactions.routePointerMove(pointer(old.x + 60, old.y + 40));
  vi.advanceTimersByTime(60);
  expect(model.read()).not.toEqual(beforeCancel);
  expect(board.interactions.routeKeyDown(new KeyboardEvent("keydown", { key: "Escape" }))).toBe(
    true
  );
  expect(model.read()).toEqual(beforeCancel);
  board.interactions.routePointerUp(pointer(old.x + 60, old.y + 40));
  vi.advanceTimersByTime(1000);
  expect(model.read()).toEqual(beforeCancel);
});
