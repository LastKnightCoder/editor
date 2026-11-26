import { contentTransferErrorText } from "@/services/content-transfer.i18n";
import { useContentExportI18n, type ContentExportMessageKey } from "../ContentExportModal/i18n";
import { readContentForExport } from "@/services/content-transfer";
import React, { useState } from "react";
import type { Descendant } from "slate";
import { FileText } from "lucide-react";
import { Button, Dialog, DialogBody, NumberInput, Select, Switch } from "@tau/ui";
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

const CODE_BLOCK_STRATEGIES = [
  "avoid",
  "adaptive",
  "auto",
] as const satisfies readonly CodeBlockBreakStrategy[];

interface PdfExportModalProps {
  visible: boolean;
  onClose: () => void;
  content: Descendant[];
  contentId?: number;
  title: string;
  author?: string;
}

/** 表单字段标签，口径与 ui/patterns 的 FormField 一致 */
const FIELD_LABEL = "text-ink-1 text-tau-meta font-medium";

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  visible,
  onClose,
  content,
  contentId,
  title,
  author,
}) => {
  const { t } = useContentExportI18n();
  const [loading, setLoading] = useState(false);
  const [pageSize, setPageSize] = useState<PdfExportOptions["pageSize"]>("A4");
  const [landscape, setLandscape] = useState(false);
  const [marginTop, setMarginTop] = useState(20);
  const [marginBottom, setMarginBottom] = useState(20);
  const [marginLeft, setMarginLeft] = useState(15);
  const [marginRight, setMarginRight] = useState(15);
  const [printBackground, setPrintBackground] = useState(true);
  const [chapterBreak, setChapterBreak] = useState(true);
  const [codeBlockStrategy, setCodeBlockStrategy] =
    useState<(typeof CODE_BLOCK_STRATEGIES)[number]>("adaptive");
  const [error, setError] = useState<
    { key: ContentExportMessageKey } | { message: string } | { reason: Error } | null
  >(null);

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

      const document = await readContentForExport(content, contentId);
      const { html: rawHtml, styles } = await buildPdfHtml({
        content: document.content,
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
          setError(result.warnings[0] ? { message: result.warnings[0] } : { key: "pdf.failed" });
        }
      }
    } catch (err) {
      console.error("PDF 导出错误：", err);
      setError(err instanceof Error ? { reason: err } : { key: "common.unknown" });
    } finally {
      setLoading(false);
    }
  };

  const marginFields = [
    { key: "top", label: t("pdf.margin.top"), value: marginTop, onChange: setMarginTop },
    {
      key: "bottom",
      label: t("pdf.margin.bottom"),
      value: marginBottom,
      onChange: setMarginBottom,
    },
    { key: "left", label: t("pdf.margin.left"), value: marginLeft, onChange: setMarginLeft },
    { key: "right", label: t("pdf.margin.right"), value: marginRight, onChange: setMarginRight },
  ];

  return (
    <Dialog
      open={visible}
      onOpenChange={next => {
        if (!next) onClose();
      }}
      title={t("pdf.title")}
      icon={<FileText />}
      subtitle={t("pdf.subtitle")}
      width={520}
      locked={loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={handleExport}
            loading={loading}
            loadingText={t("common.exporting")}
          >
            {t("common.export")}
          </Button>
        </>
      }
    >
      <DialogBody>
        {error && (
          <div className="bg-danger-soft text-danger rounded-tau-md text-tau-body mb-4 p-3">
            {"key" in error
              ? t(error.key)
              : "reason" in error
                ? contentTransferErrorText(error.reason)
                : error.message}
          </div>
        )}

        <div className="space-y-5">
          {/* Page Size */}
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL}>{t("pdf.paper")}</label>
            <Select
              value={pageSize}
              onValueChange={value => setPageSize(value)}
              options={PAGE_SIZE_OPTIONS}
            />
          </div>

          {/* Orientation */}
          <div className="flex items-center justify-between">
            <label className="text-ink-1 text-tau-body">{t("pdf.landscape")}</label>
            <Switch checked={landscape} onCheckedChange={setLandscape} />
          </div>

          {/* Margins */}
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL}>{t("pdf.margins")}</label>
            <div className="grid grid-cols-4 gap-2">
              {marginFields.map(field => (
                <div key={field.key} className="flex flex-col gap-1">
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
              <label className="text-ink-1 text-tau-body">{t("pdf.background")}</label>
              <span className="text-ink-3 text-tau-sm">{t("pdf.backgroundHint")}</span>
            </div>
            <Switch checked={printBackground} onCheckedChange={setPrintBackground} />
          </div>

          {/* Chapter Break */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <label className="text-ink-1 text-tau-body">{t("pdf.chapterBreak")}</label>
              <span className="text-ink-3 text-tau-sm">{t("pdf.chapterBreakHint")}</span>
            </div>
            <Switch checked={chapterBreak} onCheckedChange={setChapterBreak} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL}>{t("pdf.codeBreak")}</label>
            <div className="grid grid-cols-3 gap-2">
              {CODE_BLOCK_STRATEGIES.map(strategy => (
                <button
                  key={strategy}
                  type="button"
                  onClick={() => setCodeBlockStrategy(strategy)}
                  className={`rounded-tau-md text-tau-sm ease-tau-out border-[1.5px] px-3 py-2.5 font-medium transition-colors ${
                    codeBlockStrategy === strategy
                      ? "border-accent bg-accent-soft text-accent-text"
                      : "border-line-1 text-ink-2 hover:border-ink-3/50"
                  }`}
                >
                  {t(`pdf.strategy.${strategy}.label`)}
                </button>
              ))}
            </div>
            <p className="text-ink-3 text-tau-sm mt-1">
              {t(`pdf.strategy.${codeBlockStrategy}.hint`)}
            </p>
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
};
