import React, { useState } from "react";
import type { Descendant } from "slate";
import { FileText } from "lucide-react";
import { Button, Dialog, NumberInput, Select, Switch } from "@tau/ui";
import { exportPdfWithDialog } from "@/commands";
import { buildPdfHtml, processCodeBlocks } from "@/utils/pdf-html-builder";
import type { CodeBlockBreakStrategy, PdfExportOptions } from "@/types";

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

const CODE_BLOCK_STRATEGIES: Array<{
  value: CodeBlockBreakStrategy;
  label: string;
  hint: string;
}> = [
  { value: "avoid", label: "避免分页", hint: "尽量整块放置代码，可能产生较大空白。" },
  {
    value: "adaptive",
    label: "自适应",
    hint: "根据当前页剩余空间和代码长度自动决定是否跨页，优先减少空白。",
  },
  { value: "auto", label: "强制跨页", hint: "所有代码块都允许跨页，空白最少。" },
];

interface PdfExportModalProps {
  visible: boolean;
  onClose: () => void;
  content: Descendant[];
  title: string;
  author?: string;
}

/** 表单字段标签，口径与 ui/patterns 的 FormField 一致 */
const FIELD_LABEL = "text-ink-1 text-tau-meta font-medium";

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

  const marginFields = [
    { label: "上", value: marginTop, onChange: setMarginTop },
    { label: "下", value: marginBottom, onChange: setMarginBottom },
    { label: "左", value: marginLeft, onChange: setMarginLeft },
    { label: "右", value: marginRight, onChange: setMarginRight },
  ];

  return (
    <Dialog
      open={visible}
      onOpenChange={next => {
        if (!next) onClose();
      }}
      title="导出为 PDF"
      icon={<FileText />}
      subtitle="配置 PDF 导出选项"
      width={520}
      locked={loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={handleExport}
            loading={loading}
            loadingText="导出中..."
          >
            导出
          </Button>
        </>
      }
    >
      {error && (
        <div className="bg-danger-soft text-danger rounded-tau-md text-tau-body mb-4 p-3">
          {error}
        </div>
      )}

      <div className="space-y-5">
        {/* Page Size */}
        <div className="flex flex-col gap-1.5">
          <label className={FIELD_LABEL}>纸张大小</label>
          <Select
            value={pageSize}
            onValueChange={value => setPageSize(value)}
            options={PAGE_SIZE_OPTIONS}
          />
        </div>

        {/* Orientation */}
        <div className="flex items-center justify-between">
          <label className="text-ink-1 text-tau-body">横向打印</label>
          <Switch checked={landscape} onCheckedChange={setLandscape} />
        </div>

        {/* Margins */}
        <div className="flex flex-col gap-1.5">
          <label className={FIELD_LABEL}>页边距（毫米）</label>
          <div className="grid grid-cols-4 gap-2">
            {marginFields.map(field => (
              <div key={field.label} className="flex flex-col gap-1">
                <span className="text-ink-3 text-tau-sm">{field.label}</span>
                <NumberInput
                  min={0}
                  max={50}
                  value={field.value}
                  onValueChange={value => field.onChange(value ?? 0)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Print Background */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <label className="text-ink-1 text-tau-body">打印背景色</label>
            <span className="text-ink-3 text-tau-sm">代码块、表格等元素的背景色</span>
          </div>
          <Switch checked={printBackground} onCheckedChange={setPrintBackground} />
        </div>

        {/* Chapter Break */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <label className="text-ink-1 text-tau-body">H1 标题换页</label>
            <span className="text-ink-3 text-tau-sm">每个 H1 标题从新页开始</span>
          </div>
          <Switch checked={chapterBreak} onCheckedChange={setChapterBreak} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={FIELD_LABEL}>代码块分页</label>
          <div className="grid grid-cols-3 gap-2">
            {CODE_BLOCK_STRATEGIES.map(strategy => (
              <button
                key={strategy.value}
                type="button"
                onClick={() => setCodeBlockStrategy(strategy.value)}
                className={`rounded-tau-md text-tau-sm ease-tau-out border-[1.5px] px-3 py-2.5 font-medium transition-colors ${
                  codeBlockStrategy === strategy.value
                    ? "border-accent bg-accent-soft text-accent-text"
                    : "border-line-1 text-ink-2 hover:border-ink-3/50"
                }`}
              >
                {strategy.label}
              </button>
            ))}
          </div>
          <p className="text-ink-3 text-tau-sm mt-1">
            {CODE_BLOCK_STRATEGIES.find(s => s.value === codeBlockStrategy)?.hint}
          </p>
        </div>
      </div>
    </Dialog>
  );
};
