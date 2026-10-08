import { useEffect } from "react";
import { ReactEditor } from "slate-react";
import type { EditorRef } from "@tau/editor";
import { parseEntityLocation, resolveLocationNode } from "@/entity/locate";
import { scrollToAndFlash } from "@/utils/flash-element";

/** 页面参数 at 指定顶层块或勾选项时，正文加载后滚到该处并闪烁；找不到停在文首 */
export function useContentLocation(
  editor: ReturnType<EditorRef["getEditor"]> | null,
  contentId: number | undefined,
  at: string | undefined
) {
  useEffect(() => {
    if (!editor || !at) return;
    let markedElement: HTMLElement | null = null;
    const frame = requestAnimationFrame(() => {
      const node = resolveLocationNode(editor.children, parseEntityLocation(at) ?? { block: 0 });
      if (!node) return;
      try {
        const element = ReactEditor.toDOMNode(editor, node);
        markedElement = element;
        element.setAttribute("data-content-location", "");
        scrollToAndFlash(element);
      } catch {
        /* 正文切换时旧节点可能已卸载。 */
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      markedElement?.removeAttribute("data-content-location");
    };
  }, [editor, at, contentId]);
}
