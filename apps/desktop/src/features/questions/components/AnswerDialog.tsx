/**
 * 独立答案编辑：只属于这个问题的结论（不进卡片库）。
 * 新建：本地编辑，保存时建 content 并挂上（问题独占首个引用）；空内容不保存。
 * 编辑：已有正文通过文档会话自动保存；正文上方钉元信息行（时间 / 字数 /「创建为」）。
 */

import { useEffect, useRef, useState } from "react";
import type { Descendant } from "slate";
import type { EditorRef } from "@tau/editor";
import { Button, Dialog, toast } from "@tau/ui";
import ContentEditor from "@/components/ContentEditor";
import { ErrorBoundary } from "@tau/ui";
import { getContentLength } from "@/utils";
import { AnswerMetaBar } from "./AnswerMetaBar";

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
  /** 新建模式的落库；编辑模式直接自动保存已有 content，不需要 */
  onCreate?(content: Descendant[]): Promise<void>;
}) {
  const open = state !== null;
  const [content, setContent] = useState<Descendant[]>(EMPTY);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<EditorRef>(null);
  const editing = state?.mode === "edit" ? state.contentId : undefined;

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
      await onCreate?.(content);
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
      height={760}
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
      {editing != null && <AnswerMetaBar contentId={editing} content={content} />}
      <div className="border-line-2 mt-[14px] min-h-0 flex-1 overflow-y-auto border-t px-6 py-4">
        {open && (
          <ErrorBoundary>
            <ContentEditor
              key={editing ?? "new"}
              ref={editorRef}
              contentId={editing}
              initValue={EMPTY}
              readonly={false}
              onChange={setContent}
              placeHolder="用自己的话回答这个问题…"
              className="text-tau-body min-h-full"
            />
          </ErrorBoundary>
        )}
      </div>
    </Dialog>
  );
}
