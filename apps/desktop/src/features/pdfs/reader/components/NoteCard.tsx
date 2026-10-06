/**
 * 写笔记卡：在标注下方或页边弹出（定位由调用方负责），轻量富文本（Slate JSON，存进 pdf_annotations.notes）。
 * ⌘/Ctrl+↵ 保存，Esc 经页面浮层仲裁取消；标注还在落库时保存键禁用。页边新批注（draftPage）没有记录，
 * 保存时才落库。
 */

import { useCallback, useRef, useState } from "react";
import type { Descendant } from "slate";
import { Editor as SlateEditor, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { v4 as uuid } from "uuid";
import { MessageCircle } from "lucide-react";
import { Button, IconButton, cn } from "@tau/ui";
import { Editor } from "@tau/editor";
import { getDescriptionKit } from "@/services/editorKit";
import { useOverlayDismiss } from "@/page/PageProvider";
import type { Note, PdfAnnotation } from "@/types";
import {
  COLOR_SPECS,
  annotationColor,
  annotationPage,
  annotationSnippet,
  isMarginNote,
} from "../annotationModel";

const emptyValue = (): Descendant[] => [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] } as unknown as Descendant,
];

interface NoteCardProps {
  /** null = 标注刚建好还在落库，或页边新批注（此时传 draftPage） */
  record: PdfAnnotation | null;
  /** 页边新批注所在页（从 1 开始） */
  draftPage?: number;
  onSave: (notes: Note[]) => Promise<unknown>;
  onCancel: () => void;
  /** 删除笔记（页边批注即删除整条） */
  onDelete?: () => void;
  onAsk?: () => void;
  className?: string;
}

export function NoteCard({
  record,
  draftPage,
  onSave,
  onCancel,
  onDelete,
  onAsk,
  className,
}: NoteCardProps) {
  const [value, setValue] = useState<Descendant[]>(() => {
    const existing = record?.notes?.[0]?.note;
    return existing && existing.length ? existing : emptyValue();
  });
  const [saving, setSaving] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  useOverlayDismiss(onCancel);

  const savable = Boolean(record) || draftPage !== undefined;
  const save = useCallback(async () => {
    if (!savable || saving) return;
    setSaving(true);
    try {
      const base = record?.notes?.[0];
      await onSave([base ? { ...base, note: value } : { id: uuid(), note: value }]);
    } finally {
      setSaving(false);
    }
  }, [record, savable, saving, value, onSave]);

  const focusEnd = useCallback((editor: SlateEditor) => {
    window.setTimeout(() => {
      try {
        Transforms.select(editor, SlateEditor.end(editor, []));
        ReactEditor.focus(editor as never);
      } catch {
        // 编辑器已卸载
      }
    }, 0);
  }, []);

  const margin = record ? isMarginNote(record) : draftPage !== undefined;
  const color = record && !margin ? annotationColor(record) : null;
  const pageNumber = record ? annotationPage(record) : draftPage;

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="写笔记"
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onKeyDownCapture={e => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.stopPropagation();
          void save();
        }
      }}
      className={cn(
        "bg-surface shadow-float rounded-tau-md text-ink-1 flex w-[340px] flex-col gap-2 p-3",
        className
      )}
    >
      {/* 原文引用条；页边批注没有原文，不显示 */}
      {record && !margin && (
        <div
          className={cn(
            "text-tau-meta text-ink-2 line-clamp-2 border-l-[3px] pl-2",
            color && COLOR_SPECS[color].border
          )}
        >
          {annotationSnippet(record)}
        </div>
      )}
      <div className="border-line-1 bg-surface focus-within:border-accent rounded-tau-sm text-tau-body max-h-[240px] min-h-[72px] overflow-y-auto border px-2.5 py-1.5 focus-within:shadow-[var(--tau-focus-ring)]">
        <Editor
          kit={getDescriptionKit()}
          initValue={value}
          onChange={setValue}
          onInit={focusEnd}
          placeHolder="写下你的想法…"
          readonly={false}
        />
      </div>
      <div className="text-tau-meta text-ink-3 flex items-center gap-2">
        <span className="tabular-nums">
          {pageNumber === undefined
            ? "正在保存标注…"
            : `${margin ? "页边批注 · " : ""}第 ${pageNumber} 页`}
        </span>
        {onAsk && (
          <IconButton title="问 AI" aria-label="问 AI" onClick={onAsk} className="size-6">
            <MessageCircle size={13} strokeWidth={1.75} />
          </IconButton>
        )}
        <span className="flex-1" />
        {onDelete && (
          <Button variant="ghost" size="sm" className="hover:text-danger" onClick={onDelete}>
            删除
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void save()}
          disabled={!savable}
          loading={saving}
          loadingText="保存中"
        >
          保存
          <span className="ml-1 opacity-75">⌘↵</span>
        </Button>
      </div>
    </div>
  );
}
