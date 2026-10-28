import { useEffect, useRef, type RefObject } from "react";
import { Element, Node, type Descendant } from "slate";
import { ReactEditor } from "slate-react";
import type { EditorRef } from "@tau/editor";

export function pluginLocationNode(nodes: Descendant[], at: string): Descendant | undefined {
  try {
    const value: unknown = JSON.parse(at);
    if (value && typeof value === "object") {
      const location = value as { block?: unknown; taskId?: unknown };
      if (typeof location.taskId === "string" && location.taskId) {
        for (const top of nodes)
          for (const [node] of Node.nodes(top))
            if (
              Element.isElement(node) &&
              node.type === "check-list-item" &&
              node.taskId === location.taskId
            )
              return node;
      } else if (
        typeof location.block === "number" &&
        Number.isSafeInteger(location.block) &&
        location.block >= 0
      ) {
        return nodes[location.block] ?? nodes[0];
      }
    }
  } catch {
    /* 无效定位回到文首。 */
  }
  return nodes[0];
}

export function usePluginContentLocation(
  editorRef: RefObject<EditorRef | null>,
  container: HTMLElement | null,
  documentKey: string | undefined,
  at: string | undefined,
  active: boolean
) {
  const located = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!active || !container || !documentKey || !at) return;
    const key = JSON.stringify([documentKey, at]);
    if (located.current === key) return;
    let frame: number | undefined;
    let animation: Animation | undefined;
    const locate = () => {
      frame = undefined;
      const editor = editorRef.current?.getEditor();
      if (!editor) return;
      const node = pluginLocationNode(editor.children, at);
      if (!node) return;
      try {
        const element = ReactEditor.toDOMNode(editor as ReactEditor, node);
        if (!container.contains(element)) return;
        located.current = key;
        observer.disconnect();
        element.scrollIntoView({ block: "center", behavior: "instant" });
        animation = element.animate?.(
          [{ backgroundColor: "var(--tau-accent-soft)" }, { backgroundColor: "transparent" }],
          { duration: 1200 }
        );
      } catch {
        /* 文档源切换或节点尚未挂载时等待下一次更新。 */
      }
    };
    const schedule = () => {
      if (frame === undefined) frame = requestAnimationFrame(locate);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(container, { childList: true, subtree: true });
    schedule();
    const timeout = window.setTimeout(() => observer.disconnect(), 3000);
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
      if (frame !== undefined) cancelAnimationFrame(frame);
      animation?.cancel();
    };
  }, [editorRef, container, documentKey, at, active]);
}
