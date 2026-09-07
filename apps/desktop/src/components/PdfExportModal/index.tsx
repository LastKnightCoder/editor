import React, { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import type { Descendant } from "slate";
import { MdClose } from "react-icons/md";
import { exportPdfWithDialog } from "@/commands";
import { buildPdfHtml, processCodeBlocks } from "@/utils/pdf-html-builder";
import type { CodeBlockBreakStrategy, PdfExportOptions } from "@/types";
import "./index.css";

const PAGE_SIZE_OPTIONS: Array<{
  value: PdfExportOptions["pageSize"];
  label: string;
}> = [
  { value: "A3", label: "A3 (297×420mm)" },
  { value: "A4", label: "A4 (210×297mm)" },
  { value: "A5", label: "A5 (148×210mm)" },
  { value: "Letter", label: "Letter (216×279mm)" },
  { value: "Legal", label: "Legal (216×356mm)" },
  { value: "Tabloid", label: "Tabloid (279×432mm)" },
];

interface PdfExportModalProps {
  visible: boolean;
  onClose: () => void;
  content: Descendant[];
  title: string;
  author?: string;
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  visible,
  onClose,
  content,
  title,
  author,
}) => {
  const [loading, setLoading] = useState(false);
  const [pageSize, setPageSize] = useState<PdfExportOptions["pageSize"]>("A4");
  const [landscape, setLandscape] = useState(false);
  const [marginTop, setMarginTop] = useState(20);
  const [marginBottom, setMarginBottom] = useState(20);
  const [marginLeft, setMarginLeft] = useState(15);
  const [marginRight, setMarginRight] = useState(15);
  const [printBackground, setPrintBackground] = useState(true);
  const [chapterBreak, setChapterBreak] = useState(true);
  const [codeBlockStrategy, setCodeBlockStrategy] = useState<CodeBlockBreakStrategy>("adaptive");
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    try {
      setLoading(true);
      setError(null);

      const options: PdfExportOptions = {
        pageSize,
        landscape,
        margins: {
          top: marginTop,
          bottom: marginBottom,
          left: marginLeft,
          right: marginRight,
        },
        printBackground,
        displayHeaderFooter: false,
        chapterBreak,
        codeBlockBreak: {
          strategy: codeBlockStrategy,
        },
      };

      const { html: rawHtml, styles } = await buildPdfHtml({
        content,
        title,
        author,
        chapterBreak,
      });

      const html = processCodeBlocks(
        rawHtml,
        options.codeBlockBreak.strategy,
        options.codeBlockBreak.smartThreshold
      );

      const result = await exportPdfWithDialog({
        html,
        styles,
        metadata: {
          title,
          author,
        },
        options,
        defaultFileName: title,
      });

      if (!result.canceled) {
        if (result.filePath) {
          onClose();
        } else {
          setError(result.warnings[0] || "PDF 导出失败");
        }
      }
    } catch (err) {
      console.error("PDF 导出错误：", err);
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return createPortal(
    <AnimatePresence>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="m-4 flex max-h-[90vh] w-full max-w-[520px] flex-col"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
            {/* Header */}
            <div className="mb-5 flex shrink-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/20">
                <svg
                  className="h-5 w-5 text-red-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                  导出为 PDF
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                  配置 PDF 导出选项
                </p>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
              >
                <MdClose className="h-5 w-5" />
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 dark:border-red-500/20 dark:bg-red-500/10"
              >
                <p className="m-0 text-sm text-red-600 dark:text-red-400">{error}</p>
              </motion.div>
            )}

            {/* Scrollable Content */}
            <div className="pdf-modal-scroll min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-4">
                {/* Page Size */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                    纸张大小
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {PAGE_SIZE_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPageSize(option.value)}
                        className={`rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                          pageSize === option.value
                            ? "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] shadow-[0_2px_8px_rgba(99,102,241,0.3)]"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Orientation */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-slate-200">
                    横向打印
                  </label>
                  <button
                    type="button"
                    onClick={() => setLandscape(!landscape)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      landscape ? "bg-[var(--th-accent)]" : "bg-gray-200 dark:bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        landscape ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>

                {/* Margins */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                    页边距（毫米）
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500 dark:text-slate-400">上</span>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={marginTop}
                        onChange={e => setMarginTop(Number(e.target.value))}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition-all focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500 dark:text-slate-400">下</span>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={marginBottom}
                        onChange={e => setMarginBottom(Number(e.target.value))}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition-all focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500 dark:text-slate-400">左</span>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={marginLeft}
                        onChange={e => setMarginLeft(Number(e.target.value))}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition-all focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500 dark:text-slate-400">右</span>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={marginRight}
                        onChange={e => setMarginRight(Number(e.target.value))}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition-all focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Print Background */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 dark:text-slate-200">
                      打印背景色
                    </label>
                    <span className="text-xs text-gray-500 dark:text-slate-400">
                      代码块、表格等元素的背景色
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPrintBackground(!printBackground)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      printBackground ? "bg-[var(--th-accent)]" : "bg-gray-200 dark:bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        printBackground ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>

                {/* Chapter Break */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 dark:text-slate-200">
                      H1 标题换页
                    </label>
                    <span className="text-xs text-gray-500 dark:text-slate-400">
                      每个 H1 标题从新页开始
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChapterBreak(!chapterBreak)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      chapterBreak ? "bg-[var(--th-accent)]" : "bg-gray-200 dark:bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        chapterBreak ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                    代码块分页
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setCodeBlockStrategy("avoid")}
                      className={`rounded-lg px-3 py-2.5 text-xs font-medium transition-all ${
                        codeBlockStrategy === "avoid"
                          ? "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] shadow-[0_2px_8px_rgba(99,102,241,0.3)]"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      避免分页
                    </button>
                    <button
                      type="button"
                      onClick={() => setCodeBlockStrategy("adaptive")}
                      className={`rounded-lg px-3 py-2.5 text-xs font-medium transition-all ${
                        codeBlockStrategy === "adaptive"
                          ? "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] shadow-[0_2px_8px_rgba(99,102,241,0.3)]"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      自适应
                    </button>
                    <button
                      type="button"
                      onClick={() => setCodeBlockStrategy("auto")}
                      className={`rounded-lg px-3 py-2.5 text-xs font-medium transition-all ${
                        codeBlockStrategy === "auto"
                          ? "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] shadow-[0_2px_8px_rgba(99,102,241,0.3)]"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      强制跨页
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    {codeBlockStrategy === "avoid" && (
                      <span>尽量整块放置代码，可能产生较大空白。</span>
                    )}
                    {codeBlockStrategy === "adaptive" && (
                      <span>根据当前页剩余空间和代码长度自动决定是否跨页，优先减少空白。</span>
                    )}
                    {codeBlockStrategy === "auto" && <span>所有代码块都允许跨页，空白最少。</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4 flex shrink-0 justify-end gap-2 border-t border-white/20 pt-4 dark:border-white/10">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="cursor-pointer rounded-xl border border-gray-200 bg-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={loading}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-red-500 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(239,68,68,0.35),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-px hover:bg-red-600 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
              >
                {loading ? "导出中..." : "导出"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
