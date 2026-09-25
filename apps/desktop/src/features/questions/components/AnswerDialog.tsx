/**
 * 独立答案编辑：只属于这个问题的结论（不进卡片库）。
 * 新建：本地编辑，保存时建 content 并挂上（问题独占首个引用）；空内容不保存。
 * 编辑：直接编辑已有 content，节流自动保存。
 */

import { useEffect, useRef, useState } from "react";
import type { Descendant } from "slate";
import type { EditorRef } from "@tau/editor/src";
import { Button, Dialog, toast } from "@tau/ui";
import ContentEditor from "@/components/ContentEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import useEditContent from "@/hooks/useEditContent";
import { getContentLength } from "@/utils";

const EMPTY: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] } as Descendant,
];

export type AnswerDialogState =
  | { mode: "new"; questionTitle: string }
  | { mode: "edit"; questionTitle: string; contentId: number };

export function AnswerDialog({
  state,
  onClose,
  onCreate,
}: {
  state: AnswerDialogState | null;
  onClose(): void;
  onCreate(content: Descendant[]): Promise<void>;
}) {
  const open = state !== null;
  const [content, setContent] = useState<Descendant[]>(EMPTY);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<EditorRef>(null);
  const editing = state?.mode === "edit" ? state.contentId : undefined;
  const { throttleHandleEditorContentChange } = useEditContent(
    editing,
    value => editorRef.current?.setEditorValue(value),
    editing != null
  );

  useEffect(() => {
    if (!open) return;
    setContent(EMPTY);
    const timer = setTimeout(() => editorRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [open, editing]);

  const save = async () => {
    if (state?.mode !== "new") return onClose();
    if (getContentLength(content) === 0) {
      toast.warning("答案内容为空");
      return;
    }
    setSaving(true);
    try {
      await onCreate(content);
      onClose();
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
      title={state?.mode === "edit" ? "编辑答案" : "写答案"}
      subtitle={state?.questionTitle}
      locked={saving}
      width={760}
      footer={
        state?.mode === "edit" ? (
          <Button variant="primary" size="sm" onClick={onClose}>
            完成
          </Button>
        ) : (
          <>
            <span className="text-ink-3 mr-auto text-[12px]">
              独立答案只属于这个问题，不进卡片库
            </span>
            <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
              取消
            </Button>
            <Button variant="primary" size="sm" loading={saving} onClick={() => void save()}>
              保存答案
            </Button>
          </>
        )
      }
    >
      {open && (
        <ErrorBoundary>
          <ContentEditor
            key={editing ?? "new"}
            ref={editorRef}
            contentId={editing}
            initValue={EMPTY}
            readonly={false}
            onChange={value => {
              if (editing != null) throttleHandleEditorContentChange(value);
              else setContent(value);
            }}
            placeHolder="用自己的话回答这个问题…"
            className="text-tau-body min-h-[260px]"
          />
        </ErrorBoundary>
      )}
    </Dialog>
  );
}
