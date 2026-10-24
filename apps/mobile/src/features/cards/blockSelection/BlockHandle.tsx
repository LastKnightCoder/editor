import { useEffect, useRef, type PointerEvent, type RefObject } from "react";
import { GripVertical } from "lucide-react";
import type { EditorRef } from "@tau/editor";
import type { Editor } from "slate";
import { HANDLE_DRAG_CANCEL_DISTANCE, HANDLE_DRAG_DELAY_MS } from "./blockHandleState";
import { alignToFirstLine, measureBlock, useBlockMeasure } from "./measureBlocks";

/** 把手视觉高度 */
const HANDLE_HEIGHT = 26;
/** 热区高度（h-10），与视觉区上下各外扩 7px */
const HIT_HEIGHT = 40;

/** 长按提起时的指针信息，target 供拖拽引擎捕获指针 */
export type BlockDragStartPoint = {
  clientX: number;
  clientY: number;
  pointerId: number;
  target: Element | null;
};

type PressState = {
  timer: number | null;
  pointerId: number;
  target: Element | null;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
};

type BlockHandleProps = {
  editorRef: RefObject<EditorRef | null>;
  container: HTMLElement | null;
  /** 光标所在顶层块；null 时不显示 */
  blockIndex: number | null;
  onEnter: (index: number) => void;
  /** 长按 HANDLE_DRAG_DELAY_MS 后提起拖拽该块 */
  onDragStart: (index: number, point: BlockDragStartPoint) => void;
  /** 拖拽中：把手保持挂载（指针捕获在其上）但不可见 */
  dragging?: boolean;
  /** 选区 / 文档变化标记，变化时重算位置 */
  version: unknown;
};

/** 编辑态当前块左侧的把手：点击进入块选择，长按提起拖拽 */
export function BlockHandle(props: BlockHandleProps) {
  const { editorRef, container, blockIndex, onEnter, onDragStart, dragging, version } = props;
  const pressRef = useRef<PressState | null>(null);
  // 长按已提起或已取消时，松手后的 click 不再进入块选择
  const suppressClickRef = useRef(false);
  const rect = useBlockMeasure(
    editorRef,
    container,
    blockIndex !== null,
    (editor: Editor, host: HTMLElement) =>
      blockIndex === null ? null : measureBlock(editor, host, blockIndex),
    [blockIndex, version]
  );

  const clearPress = () => {
    const press = pressRef.current;
    if (press?.timer != null) window.clearTimeout(press.timer);
    pressRef.current = null;
  };
  useEffect(() => clearPress, []);

  if (blockIndex === null || !rect) return null;

  const cancelPress = () => {
    if (pressRef.current?.timer == null) return;
    clearPress();
    suppressClickRef.current = true;
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    // 不让编辑器失焦
    event.preventDefault();
    clearPress();
    suppressClickRef.current = false;
    const clientX = event.clientX ?? 0;
    const clientY = event.clientY ?? 0;
    const press: PressState = {
      timer: null,
      pointerId: event.pointerId ?? 0,
      target: event.currentTarget,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
    };
    press.timer = window.setTimeout(() => {
      pressRef.current = null;
      suppressClickRef.current = true;
      onDragStart(blockIndex, {
        clientX: press.lastX,
        clientY: press.lastY,
        pointerId: press.pointerId,
        target: press.target,
      });
    }, HANDLE_DRAG_DELAY_MS);
    pressRef.current = press;
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const press = pressRef.current;
    if (!press) return;
    press.lastX = event.clientX ?? press.lastX;
    press.lastY = event.clientY ?? press.lastY;
    const distance = Math.hypot(press.lastX - press.startX, press.lastY - press.startY);
    if (distance > HANDLE_DRAG_CANCEL_DISTANCE) cancelPress();
  };

  const handleClick = () => {
    clearPress();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onEnter(blockIndex);
  };

  const visualTop = alignToFirstLine(rect, HANDLE_HEIGHT);
  return (
    <button
      type="button"
      aria-label="选择块"
      data-block-handle={blockIndex}
      // 把手贴近屏幕左缘，长按拖拽不能被当成边缘返回
      data-no-edge-back="true"
      // touch-none：长按期间浏览器不接管为滚动手势，否则会发 pointercancel
      className={`absolute left-[-26px] z-10 flex h-10 w-8 -translate-x-1.5 touch-none select-none items-center justify-center ${dragging ? "opacity-0" : ""}`}
      style={{ top: visualTop - (HIT_HEIGHT - HANDLE_HEIGHT) / 2 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
      onMouseDown={event => event.preventDefault()}
      onClick={handleClick}
    >
      <span className="text-ink-3 flex h-[26px] w-5 items-center justify-center rounded-md">
        <GripVertical size={16} />
      </span>
    </button>
  );
}

export default BlockHandle;
