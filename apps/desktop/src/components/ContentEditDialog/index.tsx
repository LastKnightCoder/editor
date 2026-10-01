/**
 * ContentEditDialog —— 就地编辑一份已有 content 的弹窗（新体系，替代 legacy RichTextEditModal）。
 * 版式与「新建卡片」弹窗同构（CreateCardDialog）：大标题 + 编辑器，底部应答区。
 *
 * - 正文：ContentEditor + useEditContent（加载、跨窗口同步、节流自动保存），无保存按钮
 * - 标题行：不传 title 即无（卡片没有标题）；传 onTitleChange 可编辑，否则只读
 * - 底部：字数 · 已自动保存；「完成」关闭（footerActions 排在「完成」之前）
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Descendant } from "slate";
import type { EditorRef } from "@tau/editor";
import { Button, Dialog, DialogBody } from "@tau/ui";
import ContentEditor from "@/components/ContentEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import useEditContent from "@/hooks/useEditContent";
import { getContentLength } from "@/utils";

const EMPTY: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] } as Descendant,
];

export interface ContentEditDialogProps {
  open: boolean;
  contentId: number | null;
  /** 弹窗标题（动作语义，如「编辑卡片」） */
  heading: string;
  /** 次级说明，如「关联在：任务标题」 */
  subtitle?: string;
  /** 内容标题；不传即无标题行 */
  title?: string;
  titlePlaceholder?: string;
  /** 传入即标题可编辑 */
  onTitleChange?(title: string): void;
  placeholder?: string;
  /** 应答区附加操作（次级按钮），排在「完成」之前 */
  footerActions?: ReactNode;
  onClose(): void;
}

export function ContentEditDialog({
  open,
  contentId,
  heading,
  subtitle,
  title,
  titlePlaceholder = "无标题",
  onTitleChange,
  placeholder,
  footerActions,
  onClose,
}: ContentEditDialogProps) {
  const editorRef = useRef<EditorRef>(null);
  const [count, setCount] = useState(0);
  const { throttleHandleEditorContentChange } = useEditContent(
    contentId ?? undefined,
    value => {
      setCount(getContentLength(value));
    },
    open && contentId != null
  );

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onClose()}
      title={heading}
      subtitle={subtitle}
      width={720}
      footer={
        <>
          <span className="text-ink-3 mr-auto text-[12px] tabular-nums">
            {count} 字 · 已自动保存
          </span>
          {footerActions}
          <Button variant="primary" size="sm" onClick={onClose}>
            完成
          </Button>
        </>
      }
    >
      <DialogBody>
        {contentId != null && (
          <div className="flex flex-col gap-2">
            {title !== undefined && (
              <TitleField
                key={contentId}
                value={title}
                placeholder={titlePlaceholder}
                onCommit={onTitleChange}
                onEnter={() => editorRef.current?.focus()}
              />
            )}
            <ErrorBoundary>
              <ContentEditor
                key={contentId}
                ref={editorRef}
                contentId={contentId}
                initValue={EMPTY}
                readonly={false}
                onChange={value => {
                  setCount(getContentLength(value));
                  throttleHandleEditorContentChange(value);
                }}
                placeHolder={placeholder}
                className="min-h-[260px]"
              />
            </ErrorBoundary>
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
}

/** 标题：可编辑时失焦 / 回车提交（回车后焦点进正文），清空回退；Esc 放弃草稿 */
function TitleField({
  value,
  placeholder,
  onCommit,
  onEnter,
}: {
  value: string;
  placeholder: string;
  onCommit?(title: string): void;
  onEnter(): void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  if (!onCommit)
    return <div className="text-[16px] font-semibold leading-[1.5]">{value || placeholder}</div>;

  const commit = () => {
    const next = text.trim();
    if (!next) setText(value);
    else if (next !== value) onCommit(next);
  };

  return (
    <textarea
      rows={1}
      value={text}
      spellCheck={false}
      aria-label="标题"
      placeholder={placeholder}
      onChange={e => setText(e.target.value.replace(/\n/g, ""))}
      onBlur={commit}
      onKeyDown={e => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          onEnter();
        } else if (e.key === "Escape" && text !== value) {
          e.stopPropagation();
          setText(value);
        }
      }}
      className="field-sizing-content placeholder:text-ink-3 block w-full resize-none bg-transparent text-[16px] font-semibold leading-[1.5] outline-none"
    />
  );
}
