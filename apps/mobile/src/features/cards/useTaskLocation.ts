import { useEffect, useRef, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import { Element as SlateElement, Node } from "slate";
import { ReactEditor } from "slate-react";

type TaskLocationOptions = {
  editorRef: RefObject<EditorRef | null>;
  container: HTMLElement | null;
  contentId: number;
  taskId?: string;
  ready: boolean;
  active: boolean;
  onUnavailable?: (message: string) => void;
};

function hiddenWithin(element: HTMLElement, editable: HTMLElement): boolean {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      (style.height === "0px" && style.overflow === "hidden" && style.opacity === "0")
    )
      return true;
    if (current === editable) break;
  }
  return false;
}

/** 待文档与 DOM 就绪后定位原待办，不改变选区、焦点或完成状态。 */
export function useTaskLocation({
  editorRef,
  container,
  contentId,
  taskId,
  ready,
  active,
  onUnavailable,
}: TaskLocationOptions): void {
  const located = useRef<string | null>(null);
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;
  useEffect(() => {
    if (!taskId || !container || !ready || !active) return;
    const request = JSON.stringify([contentId, taskId]);
    if (located.current === request) return;
    let frame: number | null = null;
    let animation: Animation | undefined;
    let cancelled = false;
    const finish = (message?: string) => {
      located.current = request;
      observer.disconnect();
      window.clearTimeout(timeout);
      if (message) unavailableRef.current?.(message);
    };
    const locate = () => {
      frame = null;
      if (cancelled || located.current === request) return;
      const editor = editorRef.current?.getEditor();
      const editable = editorRef.current?.getEditableElement();
      if (!editor || !editable || !container.contains(editable)) return;
      for (const [node] of Node.descendants(editor)) {
        if (
          !SlateElement.isElement(node) ||
          node.type !== "check-list-item" ||
          node.taskId !== taskId
        )
          continue;
        let element: HTMLElement;
        try {
          element = ReactEditor.toDOMNode(editor as ReactEditor, node);
        } catch {
          return;
        }
        if (!editable.contains(element)) return;
        if (hiddenWithin(element, editable)) {
          finish("待办位于折叠内容中，请展开后查看");
          return;
        }
        finish();
        element.scrollIntoView({ block: "center", behavior: "instant" });
        animation = element.animate?.(
          [{ backgroundColor: "var(--tau-accent-soft)" }, { backgroundColor: "transparent" }],
          { duration: 1200 }
        );
        return;
      }
      finish("待办已不存在或已发生变化，请在原文中查看");
    };
    const schedule = () => {
      if (!cancelled && frame === null) frame = window.requestAnimationFrame(locate);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(container, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => {
      if (!cancelled && located.current !== request) finish("待办定位暂不可用，请在原文中查看");
    }, 3000);
    schedule();
    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      if (frame !== null) window.cancelAnimationFrame(frame);
      animation?.cancel();
    };
  }, [editorRef, container, contentId, taskId, ready, active]);
}
