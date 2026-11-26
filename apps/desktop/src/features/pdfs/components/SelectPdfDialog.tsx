/**
 * 选择已有 PDF（项目「关联已有 PDF」等入口）：与列表页同一份数据（pdf:library）与封面，
 * 按最近打开排序，文件名过滤，单选；双击或 ↵ 直接确认。选中态只在弹窗内，关闭即清。
 */

import { pdfText, pdfFileTitle, usePdfI18n } from "../i18n";
import { useMemo, useState } from "react";
import { FileText, Search } from "lucide-react";
import { Button, Dialog, DialogBody, Input, Loading, cn } from "@tau/ui";
import type { Pdf } from "@/types";
import { matchQuery, sortEntries, type PdfEntry } from "../model";
import { usePdfLibrary } from "../queries";
import { PdfCover } from "./PdfCover";
import { Meta } from "./PdfItems";

interface SelectPdfDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (pdf: Pdf) => Promise<void> | void;
  title?: string;
  /** 不可选的 PDF（如已关联的那份） */
  excludeIds?: number[];
}

export function SelectPdfDialog({
  open,
  onCancel,
  onConfirm,
  title = pdfText("select.title"),
  excludeIds,
}: SelectPdfDialogProps) {
  usePdfI18n();

  const { entries, loading } = usePdfLibrary();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const list = useMemo(() => {
    const exclude = new Set(excludeIds ?? []);
    return sortEntries(
      (entries ?? []).filter(e => !exclude.has(e.id) && matchQuery(e, query)),
      "opened"
    );
  }, [entries, excludeIds, query]);
  const selectedEntry = list.find(e => e.id === selected) ?? null;

  const confirm = async (entry: PdfEntry | null) => {
    if (!entry || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(entry.raw);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      onAfterClose={() => {
        setQuery("");
        setSelected(null);
      }}
      title={title}
      icon={<FileText className="size-4" strokeWidth={1.75} />}
      width={860}
      locked={submitting}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {pdfText("action.cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!selectedEntry}
            loading={submitting}
            onClick={() => void confirm(selectedEntry)}
          >
            {pdfText("action.link")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3">
          <Input
            data-autofocus
            lead={Search}
            clearable
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void confirm(selectedEntry);
            }}
            placeholder={pdfText("select.filter")}
          />
          {loading ? (
            <Loading minHeight={240} />
          ) : list.length === 0 ? (
            <p className="text-tau-meta text-ink-3 py-16 text-center">
              {entries?.length ? pdfText("select.empty") : pdfText("select.emptyHint")}
            </p>
          ) : (
            <div
              role="listbox"
              aria-label="PDF"
              className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-x-4 gap-y-5 pb-1"
            >
              {list.map(entry => {
                const on = entry.id === selected;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => setSelected(entry.id)}
                    onDoubleClick={() => void confirm(entry)}
                    className="group flex min-w-0 flex-col text-left outline-none"
                  >
                    <PdfCover
                      entry={entry}
                      className={cn(
                        "ease-tau-out w-full transition-shadow duration-150 group-focus-visible:shadow-[var(--tau-focus-ring)]",
                        on && "ring-accent ring-2 ring-offset-2"
                      )}
                    />
                    <span
                      title={pdfFileTitle(entry.raw.fileName)}
                      className={cn(
                        "mt-2 line-clamp-2 h-[2.8em] text-[13px] font-medium leading-[1.4] [overflow-wrap:anywhere]",
                        on ? "text-accent-text" : "text-ink-1"
                      )}
                    >
                      {pdfFileTitle(entry.raw.fileName)}
                    </span>
                    <span className="text-tau-micro text-ink-3 mt-0.5 flex gap-2 tabular-nums">
                      {entry.fileMissing ? (
                        <span className="text-danger">{pdfText("file.missing")}</span>
                      ) : (
                        <Meta entry={entry} />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
}
