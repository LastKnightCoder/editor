/**
 * 正文接住从白板拖来的资料：落点处插入行内连接。只认 ENTITY_DRAG_TYPE，其余拖拽（文件、块排序）原样交给编辑器。
 */

import type { ReactNode } from "react";
import type { Editor } from "slate";
import { ReactEditor } from "slate-react";
import { toast } from "@tau/ui";
import { insertEntityLink, isEntityDrag, readDraggedTarget } from "../insert";

export function ComposeDropZone({
  enabled,
  getEditor,
  children,
}: {
  /** 不在创作模式时只是一层透明容器（始终渲染，切换布局不重挂编辑器） */
  enabled: boolean;
  getEditor(): Editor | null | undefined;
  children: ReactNode;
}) {
  const pointOf = (event: React.DragEvent) => {
    const editor = getEditor();
    if (!editor) return null;
    try {
      return ReactEditor.findEventRange(editor as ReactEditor, event)?.anchor ?? null;
    } catch {
      return null;
    }
  };

  return (
    <div
      onDragOverCapture={event => {
        if (!enabled || !isEntityDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        // 光标跟着落点走，松手处就是插入处
        const editor = getEditor();
        const point = pointOf(event);
        if (editor && point) {
          try {
            ReactEditor.focus(editor as ReactEditor);
            editor.select(point);
          } catch {
            // 落点暂时不可解析（拖过行内元素边缘）：保持上一个位置
          }
        }
      }}
      onDropCapture={event => {
        if (!enabled || !isEntityDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        const editor = getEditor();
        const target = readDraggedTarget(event.dataTransfer);
        if (!editor || !target) return;
        const at = pointOf(event) ?? undefined;
        if (!insertEntityLink(editor, target, { at })) {
          toast.warning("这里不能插入链接，换个位置试试");
        }
      }}
    >
      {children}
    </div>
  );
}
