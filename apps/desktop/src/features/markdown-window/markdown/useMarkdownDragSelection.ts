import { useEffect } from "react";
import { Editor, Range, Transforms, type Point, type PointRef } from "slate";
import { ReactEditor } from "slate-react";
import type { MarkdownViewport } from "./markdownViewport";

export function useMarkdownDragSelection(
  editor: Editor | null,
  scroll: HTMLElement | null,
  viewport: MarkdownViewport,
  active: boolean
) {
  useEffect(() => {
    if (!active || !editor || !scroll) return;
    const root = ReactEditor.toDOMNode(editor, editor);
    const doc = root.ownerDocument;
    let frame = 0;
    let clickedCaret: Point | null = null;
    let drag: {
      anchor: PointRef;
      pointer: number;
      x: number;
      y: number;
      moved: boolean;
      scrolled: boolean;
    } | null = null;

    const pointAt = (x: number, y: number) => {
      const bounds = scroll.getBoundingClientRect();
      const hit = doc.caretRangeFromPoint(
        Math.min(bounds.right - 2, Math.max(bounds.left + 2, x)),
        Math.min(bounds.bottom - 2, Math.max(bounds.top + 2, y))
      );
      if (!hit || !root.contains(hit.startContainer)) return null;
      return ReactEditor.toSlatePoint(editor, [hit.startContainer, hit.startOffset], {
        exactMatch: false,
        suppressThrow: true,
      });
    };

    const sync = () => {
      frame = 0;
      if (!drag?.moved || !drag.scrolled) return;
      const anchor = drag.anchor.current;
      const focus = pointAt(drag.x, drag.y);
      if (!anchor || !focus) return;
      const next = { anchor, focus };
      if (!editor.selection || !Range.equals(editor.selection, next))
        Transforms.select(editor, next);
      viewport.updateSelection(editor);
      const native = doc.getSelection();
      if (!native) return;
      try {
        const [start, startOffset] = ReactEditor.toDOMPoint(editor, anchor);
        const [end, endOffset] = ReactEditor.toDOMPoint(editor, focus);
        if (
          native.anchorNode !== start ||
          native.anchorOffset !== startOffset ||
          native.focusNode !== end ||
          native.focusOffset !== endOffset
        ) {
          native.setBaseAndExtent(start, startOffset, end, endOffset);
        }
      } catch {
        // 下一次滚动或移针会在目标节点挂载后重试。
      }
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (!drag) return;
      drag.anchor.unref();
      drag = null;
      viewport.pinDragAnchor(editor);
    };
    const syncClickedCaret = () => {
      const point = clickedCaret;
      clickedCaret = null;
      if (!point || doc.activeElement !== root || !Editor.hasPath(editor, point.path)) return;
      try {
        const [node, offset] = ReactEditor.toDOMPoint(editor, point);
        const selection = { anchor: point, focus: point };
        if (!editor.selection || !Range.equals(editor.selection, selection)) {
          Transforms.select(editor, selection);
          viewport.updateSelection(editor);
        }
        const native = doc.getSelection();
        if (
          native &&
          (!native.isCollapsed || native.anchorNode !== node || native.anchorOffset !== offset)
        ) {
          native.setBaseAndExtent(node, offset, node, offset);
        }
      } catch {
        // 目标节点可能已被外部文件版本替换。
      }
    };
    const click = (event: MouseEvent) => {
      if (event.detail === 1) syncClickedCaret();
      else clickedCaret = null;
    };
    const down = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        event.pointerType !== "mouse" ||
        event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const target = event.target;
      if (
        !(target instanceof HTMLElement) ||
        target.closest("button,input,textarea,[contenteditable=false]")
      )
        return;
      if (target.closest('[data-slate-editor="true"]') !== root) return;
      const point = pointAt(event.clientX, event.clientY);
      if (!point) return;
      reset();
      clickedCaret = null;
      drag = {
        anchor: Editor.pointRef(editor, point),
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        scrolled: false,
      };
      viewport.pinDragAnchor(editor, point.path[0]);
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.pointer !== event.pointerId || (event.buttons & 1) === 0) return;
      drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 0;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (drag.scrolled) queue();
    };
    const onScroll = () => {
      if (!drag?.moved) return;
      drag.scrolled = true;
      queue();
    };
    const up = (event: PointerEvent) => {
      if (!drag || drag.pointer !== event.pointerId) return;
      cancelAnimationFrame(frame);
      sync();
      clickedCaret = drag.moved ? null : drag.anchor.current;
      reset();
    };

    // 浏览器在负责拖选的屏内节点被回收时会重置原生锚点，滚动后以模型中的起点续接。
    root.addEventListener("pointerdown", down, true);
    root.addEventListener("click", click, true);
    root.addEventListener("beforeinput", syncClickedCaret, true);
    root.addEventListener("keydown", syncClickedCaret, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", reset, true);
    window.addEventListener("blur", reset);
    scroll.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      reset();
      root.removeEventListener("pointerdown", down, true);
      root.removeEventListener("click", click, true);
      root.removeEventListener("beforeinput", syncClickedCaret, true);
      root.removeEventListener("keydown", syncClickedCaret, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", reset, true);
      window.removeEventListener("blur", reset);
      scroll.removeEventListener("scroll", onScroll);
    };
  }, [editor, scroll, viewport, active]);
}
