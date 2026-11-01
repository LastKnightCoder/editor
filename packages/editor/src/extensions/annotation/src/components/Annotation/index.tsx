import React, { memo, useCallback, useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Editor, Element, Node, Path, Transforms } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useFocused,
  useReadOnly,
  useSelected,
  useSlateSelector,
  useSlateStatic,
} from "slate-react";
import { cn, toast } from "@tau/ui";
import {
  EditorTooltip,
  canEditElement,
  getCommandElementPath,
  useTouchInteraction,
} from "@tau/editor/api";
import { type AnnotationElement } from "../../types.ts";
import { consumePendingEdit } from "../../operations.ts";
import { getAnnotationNumbers } from "../../numbering.ts";
import { getAnnotationContext } from "../../context.ts";
import AnnotationCard from "../AnnotationCard.tsx";
import AnnotationSheet from "../AnnotationSheet.tsx";

interface AnnotationProps {
  attributes: RenderElementProps["attributes"];
  element: AnnotationElement;
}

type OpenState = null | "view" | "edit";

const Annotation: React.FC<React.PropsWithChildren<AnnotationProps>> = memo(props => {
  const { attributes, children, element } = props;
  const { content } = element;
  const editor = useSlateStatic();
  const readOnly = useReadOnly() || !canEditElement(editor, element);
  const touch = useTouchInteraction();
  const selected = useSelected();
  const focused = useFocused();
  const number = useSlateSelector(
    useCallback(
      (current: Editor) => getAnnotationNumbers(current.children).get(element) ?? 0,
      [element]
    )
  );
  const [open, setOpen] = useState<OpenState>(null);
  const [marker, setMarker] = useState<HTMLSpanElement | null>(null);

  const findPath = useMemoizedFn((): Path | null => {
    try {
      return ReactEditor.findPath(editor, element);
    } catch {
      return null;
    }
  });

  // 刚插入的注解直接进入编辑
  useEffect(() => {
    const path = findPath();
    if (path && consumePendingEdit(editor, path)) setOpen("edit");
  }, [editor, findPath]);

  useEffect(() => {
    if (readOnly) setOpen(current => (current === "edit" ? "view" : current));
  }, [readOnly]);

  const onContentChange = useMemoizedFn((value: string) => {
    const path = getCommandElementPath(editor, { element });
    if (path) Transforms.setNodes(editor, { content: value }, { at: path });
  });

  const moveCaretAfter = useMemoizedFn(() => {
    const path = findPath();
    if (!path) return;
    const point = Editor.after(editor, path, { voids: true });
    if (point) Transforms.select(editor, point);
    ReactEditor.focus(editor);
  });

  const remove = useMemoizedFn((withUndo: boolean) => {
    const path = getCommandElementPath(editor, { element });
    if (!path) return;
    Transforms.removeNodes(editor, { at: path });
    if (withUndo && typeof editor.undo === "function")
      toast.success("已删除注解", {
        action: { label: "撤销", onClick: () => editor.undo() },
      });
  });

  const close = useMemoizedFn((restoreCaret: boolean) => {
    setOpen(null);
    // 没写内容就关掉：不留空标记
    const latest = findPath();
    const current = latest ? Node.get(editor, latest) : null;
    if (!readOnly && current && !(current as AnnotationElement).content?.trim()) {
      remove(false);
      if (restoreCaret) requestAnimationFrame(() => ReactEditor.focus(editor));
      return;
    }
    // 等浮层把焦点还给标记之后再回到正文
    if (restoreCaret) requestAnimationFrame(moveCaretAfter);
  });

  const handleDelete = useMemoizedFn(() => {
    setOpen(null);
    // 桌面靠 ⌘Z 撤销，触屏没有快捷键，给撤销提示
    remove(touch);
    if (!touch) requestAnimationFrame(() => ReactEditor.focus(editor));
  });

  const handleClick = useMemoizedFn((event: React.MouseEvent) => {
    // 开合由这里处理，别让 Slate 把点击当成移动选区
    event.preventDefault();
    event.stopPropagation();
    if (open) close(false);
    else setOpen(touch || readOnly ? "view" : "edit");
  });

  const handleKeyDown = useMemoizedFn((event: React.KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    if (!open) setOpen(touch || readOnly ? "view" : "edit");
  });

  const empty = !content.trim();
  const active = !!open;
  const preview = empty ? "空注解" : content;

  const markerNode = (
    <span
      ref={setMarker}
      role="button"
      tabIndex={-1}
      aria-label={`注解 ${number}`}
      aria-expanded={active}
      contentEditable={false}
      className={cn(
        "font-tau-mono relative inline-block cursor-pointer select-none rounded-[5px] px-1 pb-px pt-0.5 align-super text-[0.66em] font-semibold leading-none tabular-nums",
        "transition-[background-color,color,box-shadow] duration-150",
        "after:absolute after:content-['']",
        touch ? "after:-inset-x-2 after:-inset-y-2.5" : "after:-inset-x-1 after:-inset-y-1.5",
        active
          ? "bg-[var(--ed-accent)] text-[var(--ed-text-inverse)]"
          : empty
            ? "text-[var(--ed-text-tertiary)] shadow-[inset_0_0_0_1px_var(--ed-border)] hover:bg-[var(--ed-bg-hover)]"
            : "text-[var(--ed-accent-text)] hover:bg-[var(--ed-accent-soft)]",
        !active && selected && focused && "shadow-[0_0_0_1.5px_var(--ed-accent)]"
      )}
      onMouseDown={event => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {number || "·"}
    </span>
  );

  return (
    <span {...attributes} className="relative inline" contentEditable={false}>
      {touch ? (
        markerNode
      ) : (
        <EditorTooltip
          content={
            <span className="block break-words whitespace-pre-wrap">
              <span className={cn(empty && "text-[var(--ed-text-tertiary)]")}>{preview}</span>
              {!readOnly && (
                <span className="mt-1 block text-[11.5px] text-[var(--ed-text-tertiary)]">
                  点击编辑
                </span>
              )}
            </span>
          }
          delay={300}
          arrow={false}
          disabled={active}
          placement="bottom"
          className="max-h-60 max-w-[300px] overflow-hidden rounded-[10px] border-[var(--ed-border)] bg-[var(--ed-bg-surface)] px-3 py-2 text-[13.5px] leading-[1.6] text-[var(--ed-text)] shadow-[var(--ed-shadow-float)]"
        >
          {markerNode}
        </EditorTooltip>
      )}
      {children}
      {open && !touch && marker && (
        <AnnotationCard
          anchor={marker}
          number={number}
          content={content}
          readOnly={readOnly}
          onChange={onContentChange}
          onDelete={handleDelete}
          onClose={close}
        />
      )}
      {open && touch && (
        <AnnotationSheet
          mode={open}
          number={number}
          content={content}
          context={getMarkerContext(editor, findPath())}
          readOnly={readOnly}
          onModeChange={setOpen}
          onChange={onContentChange}
          onDelete={handleDelete}
          onClose={() => close(false)}
        />
      )}
    </span>
  );
});

/** 取注解所在文本块里它前后的文字 */
function getMarkerContext(editor: Editor, path: Path | null) {
  if (!path) return { before: "", after: "" };
  const block = Editor.above(editor, {
    at: path,
    match: n => Element.isElement(n) && Editor.isBlock(editor, n),
  });
  if (!block) return { before: "", after: "" };
  const [, blockPath] = block;
  const before = Editor.string(editor, {
    anchor: Editor.start(editor, blockPath),
    focus: Editor.start(editor, path),
  });
  const after = Editor.string(editor, {
    anchor: Editor.end(editor, path),
    focus: Editor.end(editor, blockPath),
  });
  return getAnnotationContext(before, after);
}

export default Annotation;
