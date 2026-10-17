import { isEqual } from "lodash";
import type Board from "../../Board";
import type { BoardElement, Operation, Point, Selection } from "../../types";
import { BoardUtil, PathUtil, PointUtil } from "../../utils";
import { releaseBoardPointer } from "../../utils/events";
import type { InteractionState } from "../InteractionState";

export interface ResizeCallbacks {
  onResizeStart?(start: Point): void;
  onResize(start: Point, end: Point, preserveRatio?: boolean, adsorb?: boolean): void;
  onResizeEnd?(start: Point, end: Point): void;
}
type Patch = Record<string, unknown>;
interface Change {
  id: string;
  before: Patch;
  after: Patch;
}
let nextGesture = 0;

/** 缩放只收集本次同步几何回调产生的字段变更，不替换整份文档快照。 */
export class ResizingState implements InteractionState {
  readonly name = "resizing";
  isFinished = false;
  private committed = false;
  private ended = false;
  private changes = new Map<string, Change>();
  private end: Point;
  private lastMove?: PointerEvent;
  private moved = false;
  private initialSelection: Selection;
  private readonly group = `resize:${++nextGesture}`;

  constructor(
    private board: Board,
    private event: PointerEvent,
    private start: Point,
    private callbacks: ResizeCallbacks
  ) {
    this.end = start;
    this.initialSelection = board.selection;
  }
  begin() {
    this.preview(() => this.callbacks.onResizeStart?.(this.start));
  }
  private preview(run: () => void) {
    try {
      this.board.interactions.runResizePreview(this, run);
    } catch (error) {
      this.board.interactions.cancelResize();
      throw error;
    }
  }
  validate(operations: readonly Operation[]) {
    if (operations.some(op => op.type !== "set_node" && op.type !== "set_selection"))
      throw new Error("缩放回调只能更新元素字段和选区");
    if (
      operations.some(
        op =>
          op.type === "set_node" &&
          ["id", "type", "children"].some(key => Object.hasOwn(op.newProperties, key))
      )
    )
      throw new Error("缩放不能改变元素身份或结构");
  }
  record(operations: readonly Operation[], before: BoardElement[], after: BoardElement[]) {
    for (const op of operations) {
      if (op.type !== "set_node") continue;
      const oldNode = PathUtil.getElement(before, op.path);
      const newNode = PathUtil.getElement(after, op.path);
      if (!oldNode || !newNode) continue;
      let change = this.changes.get(oldNode.id);
      if (!change) {
        change = { id: oldNode.id, before: {}, after: {} };
        this.changes.set(oldNode.id, change);
      }
      for (const key of Object.keys(op.newProperties)) {
        if (key === "children") continue;
        if (!Object.hasOwn(change.before, key)) change.before[key] = oldNode[key];
        change.after[key] = newNode[key];
      }
    }
  }
  private operations(reverse: boolean): Operation[] {
    const result: Operation[] = [];
    for (const change of this.changes.values()) {
      const current = BoardUtil.getElementById(this.board, change.id);
      const path = current && PathUtil.getPathByElement(this.board, current);
      if (!current || !path) continue;
      const properties: Patch = {},
        newProperties: Patch = {};
      for (const key of Object.keys(change.before)) {
        if (isEqual(change.before[key], change.after[key])) continue;
        properties[key] = reverse ? current[key] : change.before[key];
        newProperties[key] = reverse ? change.before[key] : change.after[key];
      }
      if (Object.keys(newProperties).length)
        result.push({ type: "set_node", path, properties, newProperties });
    }
    return result;
  }
  conflicts(operations: readonly Operation[]): boolean {
    return operations.some(op => {
      if (["insert_node", "remove_node", "move_node"].includes(op.type)) return true;
      if (op.type !== "set_node") return false;
      const node = PathUtil.getElement(this.board.children, op.path);
      const change = node && this.changes.get(node.id);
      return Boolean(
        change &&
        Object.keys(op.newProperties).some(
          key => Object.hasOwn(change.after, key) && !isEqual(change.before[key], change.after[key])
        )
      );
    });
  }
  private finishCallbacks() {
    if (this.ended) return;
    this.ended = true;
    this.preview(() => this.callbacks.onResizeEnd?.(this.start, this.end));
  }
  onPointerMove(event: PointerEvent) {
    if (event.pointerId !== this.event.pointerId || this.isFinished) return true;
    if (this.lastMove === event) return true;
    this.lastMove = event;
    const end = PointUtil.screenToViewPort(this.board, event.clientX, event.clientY);
    if (!end) return true;
    if (end.x !== this.start.x || end.y !== this.start.y) this.moved = true;
    if (!this.moved) return true;
    this.end = end;
    this.preview(() => this.callbacks.onResize(this.start, end, event.shiftKey, !event.altKey));
    return true;
  }
  onGlobalPointerMove(event: PointerEvent) {
    return this.onPointerMove(event);
  }
  onPointerUp(event: PointerEvent) {
    if (event.pointerId !== this.event.pointerId) return true;
    this.onPointerMove(event);
    if (!this.moved) {
      this.isFinished = true;
      return true;
    }
    this.finishCallbacks();
    const operations = this.operations(false);
    if (operations.length) this.board.recordHistory(operations, this.group);
    this.committed = true;
    this.isFinished = true;
    this.board.emit("change", { selectionOnly: true });
    return true;
  }
  onGlobalPointerUp(event: PointerEvent) {
    return this.onPointerUp(event);
  }
  onGlobalPointerCancel(event: PointerEvent) {
    if (event.pointerId === this.event.pointerId) this.isFinished = true;
    return true;
  }
  onKeyDown(event: KeyboardEvent) {
    if (
      event.key === "Escape" ||
      ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "z")
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.isFinished = true;
    }
    return true;
  }
  onExit() {
    try {
      if (!this.committed) {
        try {
          this.finishCallbacks();
        } finally {
          this.board.apply(
            [
              ...this.operations(true),
              {
                type: "set_selection",
                properties: this.board.selection,
                newProperties: this.initialSelection,
              },
            ],
            false
          );
        }
      }
    } finally {
      this.isFinished = true;
      this.changes.clear();
      this.initialSelection = { selectedElements: [], selectArea: null };
      this.lastMove = undefined;
      this.board.snap.end();
      releaseBoardPointer(this.board, this.event);
    }
  }
}
