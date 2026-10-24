import { useEffect, type MouseEvent, type RefObject, type SyntheticEvent } from "react";
import { Check } from "lucide-react";
import type { EditorRef } from "@tau/editor";
import {
  alignToFirstLine,
  findBlockIndexAtY,
  getSlateEditor,
  measureBlocks,
  useBlockMeasure,
} from "./measureBlocks";

/** 勾选圈边长 */
const CHECK_SIZE = 20;

/**
 * 块选择期间编辑器包裹元素的左内边距：正文右移 28px，左侧空出勾选列，
 * 勾选圈离屏幕边缘 12–16px（取决于页面左边距）而不是贴边。宿主随 active 切换。
 */
export const BLOCK_SELECTION_INSET_CLASS = "pl-7";

type BlockSelectionLayerProps = {
  editorRef: RefObject<EditorRef | null>;
  /** 包裹编辑器的 relative 元素，覆盖层与测量都以它为参照 */
  container: HTMLElement | null;
  active: boolean;
  selected: readonly number[];
  onToggle: (index: number) => void;
  /** 文档变化标记（如 editor.children），变化时重算块位置 */
  documentVersion: unknown;
};

/**
 * 块选择模式的覆盖层：选中块高亮、左侧勾选圈；覆盖层拦截正文点击（链接、待办、图片大图等都不触发），
 * 按点击纵坐标切换所在块的选中。不改编辑器 DOM。
 */
export function BlockSelectionLayer(props: BlockSelectionLayerProps) {
  const { editorRef, container, active, selected, onToggle, documentVersion } = props;
  const rects =
    useBlockMeasure(editorRef, container, active, measureBlocks, [documentVersion, selected]) ?? [];
  // 块选择期间正文可写（内核命令需要），焦点进入正文即退出，避免弹出键盘与光标
  useEffect(() => {
    if (!active) return;
    const root = editorRef.current?.getEditableElement();
    if (!root) return;
    const handleFocusIn = () => {
      root.blur();
      window.getSelection()?.removeAllRanges();
    };
    if (root.contains(document.activeElement)) handleFocusIn();
    root.addEventListener("focusin", handleFocusIn);
    return () => root.removeEventListener("focusin", handleFocusIn);
  }, [active, editorRef]);

  if (!active) return null;

  const preventFocusShift = (event: SyntheticEvent) => event.preventDefault();

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const editor = getSlateEditor(editorRef);
    if (!editor || !container) return;
    const y = event.clientY - container.getBoundingClientRect().top;
    const index = findBlockIndexAtY(measureBlocks(editor, container), y);
    if (index !== null) onToggle(index);
  };

  return (
    <>
      {rects.map((rect, index) =>
        rect && selected.includes(index) ? (
          <div
            key={`highlight-${index}`}
            data-block-highlight={index}
            aria-hidden="true"
            className="bg-accent-soft pointer-events-none absolute -right-1.5 left-[-16px] rounded-xl"
            style={{ top: rect.top, height: rect.height }}
          />
        ) : null
      )}
      {rects.map((rect, index) => {
        if (!rect) return null;
        const checked = selected.includes(index);
        return (
          <span
            key={`check-${index}`}
            data-block-check={index}
            aria-hidden="true"
            className={`pointer-events-none absolute left-[-8px] flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] ${
              checked ? "bg-accent border-accent text-ink-inverse" : "border-ink-3"
            }`}
            style={{ top: alignToFirstLine(rect, CHECK_SIZE) }}
          >
            {checked ? <Check size={13} strokeWidth={3} /> : null}
          </span>
        );
      })}
      {/* 点击面覆盖正文与左右边距（含勾选圈），块选择期间正文不接收点击 */}
      <div
        data-block-selection-hit="true"
        className="absolute inset-y-0 -left-6 -right-6 z-10"
        onPointerDown={preventFocusShift}
        onMouseDown={preventFocusShift}
        onClick={handleClick}
      />
    </>
  );
}

export default BlockSelectionLayer;
