import { useCallback, useContext, useLayoutEffect, useRef } from "react";
import type { EditorRef } from "@tau/editor";
import { ReactEditor } from "slate-react";
import { PageViewportContext, type PageScrollPosition } from "@/page/viewport";

type ContentEditor = ReturnType<EditorRef["getEditor"]>;

function capturePosition(element: HTMLElement, editor: ContentEditor): PageScrollPosition {
  const position: PageScrollPosition = { top: element.scrollTop, left: element.scrollLeft };
  const top = element.getBoundingClientRect().top + element.clientTop;
  let low = 0;
  let high = editor.children.length;
  try {
    while (low < high) {
      const middle = (low + high) >>> 1;
      const rect = ReactEditor.toDOMNode(editor, editor.children[middle]).getBoundingClientRect();
      if (rect.bottom <= top) low = middle + 1;
      else high = middle;
    }
    const node = editor.children[low];
    if (node && "collabId" in node && typeof node.collabId === "string") {
      const rect = ReactEditor.toDOMNode(editor, node).getBoundingClientRect();
      if (rect.height > 0) position.anchor = { id: node.collabId, offset: rect.top - top };
    }
  } catch {
    // 折叠或正在移除的块没有 DOM 落点，仍保留真实滚动偏移。
  }
  return position;
}

function restorePosition(
  element: HTMLElement,
  editor: ContentEditor,
  position: PageScrollPosition
) {
  const behavior = element.style.scrollBehavior;
  element.style.scrollBehavior = "auto";
  element.scrollLeft = position.left;
  element.scrollTop = position.top;
  if (position.anchor) {
    const anchor = position.anchor;
    const node = editor.children.find(node => "collabId" in node && node.collabId === anchor.id);
    if (node) {
      try {
        const rect = ReactEditor.toDOMNode(editor, node).getBoundingClientRect();
        if (rect.height > 0)
          element.scrollTop +=
            rect.top - element.getBoundingClientRect().top - element.clientTop - anchor.offset;
      } catch {
        // 目标块已删除或折叠时使用保存的滚动偏移。
      }
    }
  }
  element.style.scrollBehavior = behavior;
}

export function useContentViewport(element: HTMLElement | null, key: string) {
  const viewport = useContext(PageViewportContext);
  const editor = useRef<ContentEditor | null>(null);
  const generation = useRef(0);
  const invalidate = useCallback(() => {
    generation.current++;
    editor.current = null;
  }, []);

  useLayoutEffect(() => {
    if (!element || !viewport) return;
    const ready = () => {
      const value = editor.current;
      if (!value) return false;
      const last = value.children.at(-1);
      if (!last) return true;
      try {
        // 文档连接先更新 Slate，再提交 DOM；实例存在不代表正文已经完成布局。
        const node = ReactEditor.toDOMNode(value, last);
        const root = ReactEditor.toDOMNode(value, value);
        return (
          node.isConnected && element.contains(node) && root.getBoundingClientRect().height > 0
        );
      } catch {
        return false;
      }
    };
    const observer =
      viewport.restoring && viewport.active
        ? new MutationObserver(() => {
            viewport.restore(key);
            if (!viewport.restoring) observer?.disconnect();
          })
        : null;
    observer?.observe(element, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style", "hidden"],
    });
    const unregister = viewport.register(key, {
      capture: () => (editor.current ? capturePosition(element, editor.current) : null),
      ready,
      restore: position => {
        if (editor.current) restorePosition(element, editor.current, position);
      },
    });
    return () => {
      invalidate();
      observer?.disconnect();
      unregister();
    };
  }, [element, invalidate, key, viewport]);

  const onReady = useCallback(
    (value: ContentEditor) => {
      const current = generation.current;
      const restore = () => {
        if (generation.current !== current) return;
        editor.current = value;
        viewport?.restore(key);
      };
      if (viewport?.restoring && document.fonts?.status === "loading")
        void document.fonts.ready.then(restore);
      else restore();
    },
    [key, viewport]
  );

  const onLoadError = useCallback(() => {
    invalidate();
    viewport?.complete(key);
  }, [invalidate, key, viewport]);
  return { onReady, onLoadError };
}
