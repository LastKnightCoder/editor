import { afterEach, expect, it } from "vitest";
import Board from "../Board";
import { CommonPlugin, type CommonElement } from "../plugins/CommonPlugin";
import { FramePlugin } from "../plugins/FramePlugin";
import { ColumnPlugin } from "../plugins/ColumnPlugin";
import { EHandlerPosition } from "../types/resize";
import type { BoardElement, Point } from "../types";
import { BOARD_TO_CONTAINER } from "../constants/map";
import { BoardUtil } from "../utils/BoardUtil";

class Box extends CommonPlugin {
  name = "test.box";
  start = this.onResizeStart;
  resize = this.onResize;
  end = this.onResizeEnd;
}
class Frame extends FramePlugin {
  start = this.onResizeStart;
  resize = this.onResize;
  end = this.onResizeEnd;
}
class Column extends ColumnPlugin {
  start = this.onResizeStart;
  resize = this.onResize;
  end = this.onResizeEnd;
}
const box = (id = "box") => ({ id, type: "test.box", x: 0, y: 0, width: 100, height: 80 });
const boards: Board[] = [];
const make = (children: BoardElement[] = [box()]) => {
  const board = new Board(
    children,
    { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    { selectedElements: [children[0]], selectArea: null }
  );
  board.addPlugin(new Box());
  board.addPlugin(new Frame());
  board.addPlugin(new Column());
  board.setActive(true);
  const root = document.createElement("div");
  root.tabIndex = 0;
  root.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 800,
    height: 600,
    right: 800,
    bottom: 600,
    toJSON() {},
  });
  document.body.append(root);
  BOARD_TO_CONTAINER.set(board, root);
  boards.push(board);
  return board;
};
let pointer = 0;
const event = (type: string, x: number, y: number, pointerId: number) => {
  const value = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(value, "pointerId", { value: pointerId });
  return value as PointerEvent;
};
const start = (board: Board, id = "box", position = EHandlerPosition.BottomRight) => {
  const initial = BoardUtil.getElementById(board, id) as CommonElement;
  const plugin = board.getPlugin(initial.type) as unknown as {
    start(element: CommonElement): void;
    resize(
      board: Board,
      element: CommonElement,
      position: EHandlerPosition,
      start: Point,
      end: Point,
      ratio: boolean,
      snap: boolean
    ): void;
    end(board: Board): void;
  };
  const pid = ++pointer;
  const cleanup = board.interactions.startResize(event("pointerdown", 100, 80, pid), {
    onResizeStart: () => plugin.start(initial),
    onResize: (from, to) =>
      plugin.resize(
        board,
        BoardUtil.getElementById(board, id) as CommonElement,
        position,
        from,
        to,
        true,
        false
      ),
    onResizeEnd: () => plugin.end(board),
  });
  expect(cleanup).toBeTypeOf("function");
  return {
    move: (x = 200, y = 160) =>
      board.interactions.routePointerMove(event("pointermove", x, y, pid)),
    up: (x = 200, y = 160) => board.interactions.routePointerUp(event("pointerup", x, y, pid)),
    cancel: () =>
      board.interactions.routeGlobalPointerCancel(event("pointercancel", 200, 160, pid)),
    cleanup,
  };
};
afterEach(() => {
  boards.splice(0).forEach(board => board.destroy());
  document.body.innerHTML = "";
});

it("一次缩放只生成一个历史单元，最后 pointerup 位置生效，撤销重做一致", () => {
  const board = make();
  const gesture = start(board);
  gesture.move(150, 120);
  gesture.move();
  expect(board.undos).toHaveLength(0);
  gesture.up(250, 200);
  expect(board.children[0].width).toBe(250);
  expect(board.undos).toHaveLength(1);
  board.undo();
  expect(board.children[0].width).toBe(100);
  board.redo();
  expect(board.children[0].width).toBe(250);
});
it.each(["pointercancel", "escape", "undo-key", "unmount", "inactive", "readonly", "destroy"])(
  "%s 回退所有预览，不新增历史",
  kind => {
    const board = make();
    const initial = board.children;
    const gesture = start(board);
    gesture.move();
    if (kind === "pointercancel") gesture.cancel();
    if (kind === "escape")
      board.interactions.routeKeyDown(new KeyboardEvent("keydown", { key: "Escape" }));
    if (kind === "unmount") gesture.cleanup?.();
    if (kind === "undo-key")
      board.interactions.routeKeyDown(new KeyboardEvent("keydown", { key: "z", metaKey: true }));
    if (kind === "inactive") board.setActive(false);
    if (kind === "readonly") board.readonly = true;
    if (kind === "destroy") board.destroy();
    expect(board.children).toEqual(initial);
    expect(board.undos).toHaveLength(0);
    expect(board.interactions.activePointerState).toBeNull();
    gesture.up(300, 240);
    expect(board.children).toEqual(initial);
  }
);
it("不移动不记录，独立手势不与创建或彼此合并", async () => {
  const board = make();
  start(board).up(100, 80);
  expect(board.undos).toHaveLength(0);
  await Promise.resolve();
  const first = start(board);
  first.up();
  await Promise.resolve();
  const second = start(board);
  second.up(150, 120);
  expect(board.undos).toHaveLength(2);
});
it("删除目标前回退预览，撤销删除得到原始尺寸而非半成品", () => {
  const board = make();
  const gesture = start(board);
  gesture.move();
  board.apply({ type: "remove_node", path: [0], node: board.children[0] });
  expect(board.children).toEqual([]);
  expect(board.interactions.activePointerState).toBeNull();
  board.undo();
  expect(board.children[0].width).toBe(100);
});
it("子元素缩放与父画框自适应共同撤销", () => {
  const child = box();
  const board = make([
    {
      ...box("frame"),
      type: "frame",
      title: "",
      autoResize: true,
      padding: 10,
      minWidth: 40,
      minHeight: 40,
      children: [child],
    },
  ]);
  const before = board.children;
  const gesture = start(board, child.id);
  gesture.up();
  expect(board.undos).toHaveLength(1);
  expect(board.children[0].children?.[0].width).toBe(200);
  board.undo();
  expect(board.children).toEqual(before);
});
it("分栏缩放保留布局算法并把子元素变更纳入同一历史", () => {
  const board = make([
    {
      ...box("column"),
      type: "column",
      width: 300,
      padding: 8,
      gap: 8,
      minWidth: 200,
      maxWidth: 600,
      title: "",
      children: [box()],
    },
  ]);
  const before = board.children;
  const gesture = start(board, "column", EHandlerPosition.Right);
  gesture.up();
  expect(board.children[0].width).toBe(400);
  expect(board.undos).toHaveLength(1);
  board.undo();
  expect(board.children).toEqual(before);
});
it("两个白板不串状态，其他 pointerId 不结束当前手势", () => {
  const a = make(),
    b = make();
  const gesture = start(a);
  gesture.move();
  a.interactions.routePointerUp(event("pointerup", 300, 240, 99999));
  expect(a.interactions.activePointerState?.name).toBe("resizing");
  expect(b.children[0].width).toBe(100);
  gesture.cancel();
  expect(a.children[0].width).toBe(100);
});

it("缩放期间其他字段更新不被取消回退覆盖", () => {
  const board = make();
  const gesture = start(board);
  gesture.move();
  board.apply({
    type: "set_node",
    path: [0],
    properties: { name: undefined },
    newProperties: { name: "并发修改" },
  });
  expect(board.interactions.activePointerState?.name).toBe("resizing");
  gesture.cancel();
  expect(board.children[0]).toMatchObject({ width: 100, name: "并发修改" });
});
