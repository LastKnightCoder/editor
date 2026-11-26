import { useEffect, useState, type RefObject } from "react";
import { Editor } from "slate";
import { ReactEditor } from "slate-react";
import type { EditorRef } from "@tau/editor";
import { getContentLength } from "@/utils";

import { useMarkdownFileI18n } from "../file.i18n";

export function MarkdownSelectionCount({
  editorRef,
  richRef,
  useViewport,
}: {
  editorRef: RefObject<EditorRef | null>;
  richRef: RefObject<HTMLDivElement | null>;
  useViewport: boolean;
}) {
  const { t, locale } = useMarkdownFileI18n();
  // 独立更新状态栏，避免正文重渲染抢先回写尚未同步到 Slate 的原生选区。
  const [selectedWords, setSelectedWords] = useState(0);
  useEffect(() => {
    const onSelectionChange = () => {
      const selection = window.getSelection();
      const inside = Boolean(
        selection?.anchorNode && richRef.current?.contains(selection.anchorNode)
      );
      let text = "";
      if (inside && selection && !selection.isCollapsed) {
        text = selection.toString();
        const editor = useViewport ? editorRef.current?.getEditor() : undefined;
        if (editor) {
          try {
            const range = ReactEditor.toSlateRange(editor, selection, {
              exactMatch: false,
              suppressThrow: true,
            });
            if (range) text = Editor.string(editor, range);
          } catch {
            // 切换源码时 DOM 选区可能早于 Slate 重新绑定。
          }
        }
      }
      setSelectedWords(text ? getContentLength([{ type: "formatted", text }]) : 0);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [editorRef, richRef, useViewport]);

  if (selectedWords === 0) return null;
  return (
    <span>
      {t("file.selected")}{" "}
      <b className="text-ink-2 font-medium">{selectedWords.toLocaleString(locale)}</b>{" "}
      {t("file.characters", { count: selectedWords })}
    </span>
  );
}
