import { useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { Path, type Element } from "slate";
import { ReactEditor, useSlateStatic } from "slate-react";
import { registerBlockNavigation, unregisterBlockNavigation } from "@tau/editor/api";

export type SourceFocusPosition = "start" | "end";

/**
 * 源码块响应外部的「进入编辑」请求：插入或退格时派发的 `preview-editor-focus`（detail 为元素、
 * `{ element }` 或 `{ path }`），以及方向键在块间导航。focus 返回是否接住了请求。
 */
export function useSourceFocusRequests(
  element: Element,
  focus: (position: SourceFocusPosition) => boolean
) {
  const editor = useSlateStatic();
  const request = useMemoizedFn(focus);

  useEffect(() => {
    const handleFocus = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      let matched = detail === element || detail?.element === element;
      if (!matched && Array.isArray(detail?.path)) {
        try {
          matched = Path.equals(ReactEditor.findPath(editor, element), detail.path);
        } catch {
          matched = false;
        }
      }
      if (matched) request("start");
    };
    document.addEventListener("preview-editor-focus", handleFocus);
    return () => document.removeEventListener("preview-editor-focus", handleFocus);
  }, [editor, element, request]);

  useEffect(() => {
    registerBlockNavigation(element, {
      focusStart: () => request("start"),
      focusEnd: () => request("end"),
    });
    return () => unregisterBlockNavigation(element);
  }, [element, request]);
}
