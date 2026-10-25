import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ReactEditor, useFocused, useSlateSelection, useSlateStatic } from "slate-react";
import { Range } from "slate";
import { CursorOverlay, type CursorOverlayData } from "./Cursors";
import type { NodeTreeEditor } from "./withNodeTree";
import type { ContentCollaborationBinding } from "./types";
import { effectiveZoom } from "./cursorOverlay";

export function NodeTreeCursors({
  binding,
  containerRef,
}: {
  binding: ContentCollaborationBinding;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const editor = useSlateStatic() as NodeTreeEditor;
  const selection = useSlateSelection(),
    focused = useFocused();
  const owner = useRef(crypto.randomUUID());
  const [cursors, setCursors] = useState<CursorOverlayData[]>([]);
  useLayoutEffect(() => {
    const current = binding.awareness.getLocalState()?.nodeTreeSelection;
    if (focused) {
      binding.awareness.setLocalStateField("nodeTreeSelection", {
        owner: owner.current,
        range: editor.captureNodeTreeSelection(),
      });
    } else if (current?.owner === owner.current)
      binding.awareness.setLocalStateField("nodeTreeSelection", null);
  }, [binding, editor, selection, focused]);
  useEffect(
    () => () => {
      if (binding.awareness.getLocalState()?.nodeTreeSelection?.owner === owner.current)
        binding.awareness.setLocalStateField("nodeTreeSelection", null);
    },
    [binding]
  );
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const container = containerRef.current;
      if (!container) return;
      const origin = container.getBoundingClientRect(),
        next: CursorOverlayData[] = [],
        zoom = effectiveZoom(container);
      const box = (rect: DOMRect) => ({
        top: rect.top - origin.top + container.scrollTop * zoom,
        left: rect.left - origin.left + container.scrollLeft * zoom,
        width: rect.width,
        height: rect.height,
      });
      for (const [clientId, state] of binding.awareness.getStates()) {
        if (clientId === binding.awareness.clientID) continue;
        const range = editor.resolveNodeTreeSelection(state.nodeTreeSelection?.range);
        if (!range) continue;
        try {
          const selected = ReactEditor.toDOMRange(editor, range);
          const caret = ReactEditor.toDOMRange(editor, {
            anchor: range.focus,
            focus: range.focus,
          }).getBoundingClientRect();
          const user = state.user;
          next.push({
            clientId,
            data: {
              id: typeof user?.id === "string" ? user.id : undefined,
              name: typeof user?.name === "string" ? user.name.slice(0, 100) : "协作者",
            },
            caretPosition: box(caret),
            selectionRects: Range.isCollapsed(range)
              ? []
              : Array.from(selected.getClientRects(), box),
          });
        } catch {
          /* 不可见或已删除的节点不绘制旧光标。 */
        }
      }
      setCursors(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    binding.awareness.on("change", schedule);
    editor.nodeTree.doc.on("afterTransaction", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
    if (containerRef.current) observer?.observe(containerRef.current);
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      binding.awareness.off("change", schedule);
      editor.nodeTree.doc.off("afterTransaction", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [binding, editor, containerRef]);
  const local = binding.awareness.getLocalState()?.user?.id;
  return (
    <CursorOverlay
      cursors={cursors}
      containerRef={containerRef}
      localUserId={typeof local === "string" ? local : undefined}
    />
  );
}
