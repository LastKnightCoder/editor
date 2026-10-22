import { useEffect, useRef, type PointerEvent, type RefObject } from "react";
import { GripVertical } from "lucide-react";
import type { EditorRef } from "@tau/editor";
import type { Editor } from "slate";
import { HANDLE_LONG_PRESS_MS } from "./blockHandleState";
import { alignToFirstLine, measureBlock, useBlockMeasure } from "./measureBlocks";

/** 把手视觉高度 */
const HANDLE_HEIGHT = 26;
/** 热区高度（h-10），与视觉区上下各外扩 7px */
const HIT_HEIGHT = 40;

type BlockHandleProps = {
  editorRef: RefObject<EditorRef | null>;
  container: HTMLElement | null;
  /** 光标所在顶层块；null 时不显示 */
  blockIndex: number | null;
  onEnter: (index: number) => void;
  /** 选区 / 文档变化标记，变化时重算位置 */
  version: unknown;
};

/** 编辑态当前块左侧的把手：点击或长按进入块选择 */
export function BlockHandle(props: BlockHandleProps) {
  const { editorRef, container, blockIndex, onEnter, version } = props;
  const longPressTimerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);
  const rect = useBlockMeasure(
    editorRef,
    container,
    blockIndex !== null,
    (editor: Editor, host: HTMLElement) =>
      blockIndex === null ? null : measureBlock(editor, host, blockIndex),
    [blockIndex, version]
  );

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  useEffect(() => clearLongPress, []);

  if (blockIndex === null || !rect) return null;

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    // 不让编辑器失焦
    event.preventDefault();
    longPressedRef.current = false;
    clearLongPress();
    // 长按进入选择
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressedRef.current = true;
      onEnter(blockIndex);
    }, HANDLE_LONG_PRESS_MS);
  };

  const handleClick = () => {
    clearLongPress();
    if (longPressedRef.current) {
      longPressedRef.current = false;
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
      className="absolute left-[-26px] z-10 flex h-10 w-8 -translate-x-1.5 select-none items-center justify-center"
      style={{ top: visualTop - (HIT_HEIGHT - HANDLE_HEIGHT) / 2 }}
      onPointerDown={handlePointerDown}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
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
