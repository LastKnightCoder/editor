import {
  useExportI18n,
  getExportLocale,
  exportTranslator,
  exportErrorReason,
  type ExportMessageKey,
} from "@/features/transfer/i18n-export";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Dialog, Input, Select, Switch, cn, toast } from "@tau/ui";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { Download, Info } from "lucide-react";
import {
  exportEpubWithDialog,
  exportPdfWithDialog,
  saveFileWithDialog,
  showInFolder,
} from "@/commands";
import useSettingStore from "@/stores/useSettingStore";
import { saveMarkdownOutput } from "@/services/content-transfer";
import { sanitizeFileName } from "@/utils/file-name";
import type {
  BatchExportRule,
  BatchExportScope,
  BatchExportSettings,
  EpubMetadataInput,
} from "@/types";
import {
  buildBatchEpubPayload,
  buildBatchPdfPayload,
  buildMarkdownZipBytes,
  buildMergedMarkdown,
  collectExportableIds,
  flattenSelectedChapters,
  loadScopeTree,
  localizeChaptersForMerge,
  type BatchExportTreeNode,
} from "@/utils/batch-export";
import ExportCheckTree, { ExportTreeEmpty } from "./ExportCheckTree";
import FormatPicker from "./FormatPicker";
import { FORMAT_OPTIONS } from "./formats";

interface BatchExportModalProps {
  open: boolean;
  onClose: () => void;
  scope: BatchExportScope;
}

const DEFAULT_PDF_SETTINGS: NonNullable<BatchExportSettings["pdf"]> = {
  outline: true,
  tocPage: true,
};

const DEFAULT_SETTINGS: BatchExportSettings = {
  excludedIds: [],
  formats: { pdf: true, epub: false, markdown: false, markdownZip: false },
  rule: { pageBreak: true, asHeading: true, headingLevel: 1 },
  pdf: DEFAULT_PDF_SETTINGS,
  epubMeta: {},
};

const normalizeText = (value?: string) => (value || "").trim();

interface SettingRowProps {
  title: string;
  description: string;
  /** 仅对某种格式生效时的格式标签 */
  formatTag?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** 开关左侧的附加控件（点击不触发整行切换） */
  extra?: ReactNode;
}

/** 排版设置行：整行可点切换，开关在最右 */
const SettingRow = ({
  title,
  description,
  formatTag,
  checked,
  disabled,
  onCheckedChange,
  extra,
}: SettingRowProps) => (
  <div
    className={cn("flex items-center gap-3 px-3.5 py-2.5", !disabled && "cursor-pointer")}
    onClick={disabled ? undefined : () => onCheckedChange(!checked)}
  >
    <div className="min-w-0 flex-1">
      <div
        className={cn(
          "text-tau-body flex items-center gap-[7px] font-medium",
          disabled ? "text-ink-3" : "text-ink-1"
        )}
      >
        {title}
        {formatTag && (
          <span className="font-tau-mono text-ink-2 border-line-1 rounded-[4px] border px-[5px] text-[10px] leading-[1.5] font-semibold tracking-[0.04em]">
            {formatTag}
          </span>
        )}
      </div>
      <div className="text-ink-3 text-tau-sm mt-px">{description}</div>
    </div>
    {extra && <div onClick={event => event.stopPropagation()}>{extra}</div>}
    <Switch
      size="sm"
      checked={checked && !disabled}
      disabled={disabled}
      aria-label={title}
      onClick={event => event.stopPropagation()}
      onCheckedChange={onCheckedChange}
    />
  </div>
);

const BatchExportModal = (props: BatchExportModalProps) => {
  const { t } = useExportI18n();
  const number = (value: number) => value.toLocaleString(getExportLocale());
  const { open, onClose, scope } = props;
  const dbName = useSettingStore(state => state.setting.database.active);

  const storageKey = useMemo(
    () => `batch-export-settings:${dbName}:${scope.type}:${scope.id}`,
    [dbName, scope.type, scope.id]
  );

  const [remembered, setRemembered] = useLocalStorageState<BatchExportSettings | undefined>(
    storageKey,
    { defaultValue: undefined }
  );

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{
    percent: number;
    label?: string;
    stage?: ExportMessageKey;
  } | null>(null);
  const [tree, setTree] = useState<BatchExportTreeNode[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<number[]>([]);
  const [formats, setFormats] = useState(DEFAULT_SETTINGS.formats);
  const [rule, setRule] = useState<BatchExportRule>(DEFAULT_SETTINGS.rule);
  const [pdfSettings, setPdfSettings] = useState(DEFAULT_PDF_SETTINGS);
  const [bookTitle, setBookTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [language, setLanguage] = useState("zh-CN");

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    loadScopeTree(scope)
      .then(nodes => {
        if (cancelled) {
          return;
        }
        setTree(nodes);
        const exportableIds = collectExportableIds(nodes);
        const excluded = new Set(remembered?.excludedIds || []);
        setCheckedKeys(exportableIds.filter(id => !excluded.has(id)));
        setFormats(remembered?.formats || DEFAULT_SETTINGS.formats);
        setRule(remembered?.rule || DEFAULT_SETTINGS.rule);
        setPdfSettings(remembered?.pdf || DEFAULT_PDF_SETTINGS);
        setBookTitle(scope.title || "未命名文档");
        setAuthor(remembered?.epubMeta?.author || "");
        setLanguage(remembered?.epubMeta?.language || "zh-CN");
        setLoading(false);
      })
      .catch(error => {
        if (cancelled) {
          return;
        }
        const msg = error instanceof Error ? error.message : String(error);
        toast.error(exportTranslator.t("feedback.loadFailed", { reason: msg }));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // remembered 仅在打开时读取一次，避免勾选过程中被回写覆盖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope.type, scope.id, scope.title, storageKey]);

  const exportableIds = useMemo(() => collectExportableIds(tree), [tree]);
  const selectedCount = useMemo(
    () => checkedKeys.filter(id => exportableIds.includes(id)).length,
    [checkedKeys, exportableIds]
  );

  const selectedFormats = FORMAT_OPTIONS.filter(option => formats[option.key]);
  // 导出规则只作用于 PDF / EPUB / 合并 Markdown；仅选 ZIP 时不适用
  const rulesApplicable = formats.pdf || formats.epub || formats.markdown;
  // 书名与作者写入 PDF / EPUB 元数据；只导 Markdown 时书名仅作文件名
  const needsBookMeta = formats.pdf || formats.epub;
  const hasRule = !rulesApplicable || rule.pageBreak || rule.asHeading;
  const blockReason = loading
    ? t("batch.loading")
    : exportableIds.length === 0
      ? t("batch.noDocuments")
      : selectedCount === 0
        ? t("batch.selectOne")
        : selectedFormats.length === 0
          ? t("batch.selectFormat")
          : !hasRule
            ? t("batch.selectRule")
            : normalizeText(bookTitle).length === 0
              ? t(needsBookMeta ? "batch.bookTitleRequired" : "batch.fileNameRequired")
              : "";
  const canExport = !blockReason;
  const impact = exporting
    ? exportProgress?.stage
      ? t(exportProgress.stage)
      : exportProgress?.label || t("progress.exporting")
    : blockReason ||
      t("batch.impact", {
        count: selectedCount,
        amount: number(selectedCount),
        formats: new Intl.ListFormat(getExportLocale(), {
          style: "short",
          type: "conjunction",
        }).format(selectedFormats.map(option => option.label)),
      });

  const handleConfirm = useMemoizedFn(async () => {
    const title = normalizeText(bookTitle);
    if (!title) {
      toast.error(t("batch.bookTitleEmpty"));
      return;
    }

    const chapters = flattenSelectedChapters(tree, new Set(checkedKeys));
    if (chapters.filter(chapter => !chapter.isGroup).length === 0) {
      toast.error(t("batch.chooseContent"));
      return;
    }

    setExporting(true);
    try {
      const savedPaths: string[] = [];
      const warnings: string[] = [];
      let canceled = false;

      // 进度按处理单元推进：每章序列化 / 每个 ZIP 文件各 1 单元，每种格式收尾（生成文件）再 1 单元
      const contentCount = chapters.filter(chapter => !chapter.isGroup).length;
      const epubUnits = formats.epub ? chapters.length + 1 : 0;
      const pdfUnits = formats.pdf ? chapters.length + 1 : 0;
      const markdownUnits = formats.markdown ? 1 : 0;
      const zipUnits = formats.markdownZip ? contentCount + 1 : 0;
      const totalUnits = epubUnits + pdfUnits + markdownUnits + zipUnits;
      let finishedUnits = 0;
      const report = (processed: number, label?: string, stage?: ExportMessageKey) => {
        if (totalUnits <= 0) {
          return;
        }
        const percent = Math.min(99, Math.round(((finishedUnits + processed) / totalUnits) * 100));
        setExportProgress({ percent, label, stage });
      };

      if (formats.epub) {
        const metadata: EpubMetadataInput = {
          title,
          author: normalizeText(author),
          language: normalizeText(language) || "zh-CN",
          description: "",
        };
        const { payload, warnings: epubWarnings } = await buildBatchEpubPayload({
          chapters,
          metadata,
          rule,
          onProgress: (processed, _total, label) => report(processed, label),
        });
        report(epubUnits - 1, undefined, "progress.generateEpub");
        const result = await exportEpubWithDialog(payload);
        finishedUnits += epubUnits;
        warnings.push(...epubWarnings, ...(result.warnings || []));
        if (result.canceled) {
          canceled = true;
        } else if (result.filePath) {
          savedPaths.push(result.filePath);
        }
      }

      if (formats.pdf && !canceled) {
        const payload = await buildBatchPdfPayload({
          chapters,
          title,
          author: normalizeText(author) || undefined,
          rule,
          pdf: pdfSettings,
          onProgress: (processed, _total, label) => report(processed, label),
        });
        report(pdfUnits - 1, undefined, "progress.generatePdf");
        const result = await exportPdfWithDialog(payload);
        finishedUnits += pdfUnits;
        warnings.push(...(result.warnings || []));
        if (result.canceled) {
          canceled = true;
        } else if (result.filePath) {
          savedPaths.push(result.filePath);
        }
      }

      if (formats.markdown && !canceled) {
        report(0, undefined, "progress.packAssets");
        const merged = await localizeChaptersForMerge(chapters);
        warnings.push(...merged.warnings);
        report(0, undefined, "progress.generateMarkdown");
        // 有本机资源时与 assets/ 一起存为 .zip
        const result = await saveMarkdownOutput({
          baseName: sanitizeFileName(title, "未命名"),
          markdown: buildMergedMarkdown(merged.chapters, rule),
          assetFiles: merged.assetFiles,
        });
        finishedUnits += markdownUnits;
        if (result.canceled) {
          canceled = true;
        } else if (result.filePath) {
          savedPaths.push(result.filePath);
        }
      }

      if (formats.markdownZip && !canceled) {
        report(0, undefined, "progress.packAssets");
        const zip = await buildMarkdownZipBytes(
          tree,
          new Set(checkedKeys),
          (processed, _total, label) => report(processed, label)
        );
        warnings.push(...zip.warnings);
        report(zipUnits - 1, undefined, "progress.saveZip");
        const result = await saveFileWithDialog({
          defaultFileName: `${sanitizeFileName(title, "未命名")}.zip`,
          filters: [{ name: "ZIP", extensions: ["zip"] }],
          data: zip.bytes,
        });
        finishedUnits += zipUnits;
        if (result.canceled) {
          canceled = true;
        } else if (result.filePath) {
          savedPaths.push(result.filePath);
        }
      }

      setExportProgress({ percent: 100 });

      setRemembered({
        excludedIds: exportableIds.filter(id => !checkedKeys.includes(id)),
        formats,
        rule,
        pdf: pdfSettings,
        epubMeta: {
          author: normalizeText(author) || undefined,
          language: normalizeText(language) || "zh-CN",
        },
      });

      if (canceled) {
        toast.info(t("feedback.canceled"));
      } else {
        toast.success(
          savedPaths.length > 0
            ? t("feedback.saved", {
                paths: new Intl.ListFormat(getExportLocale(), {
                  style: "long",
                  type: "conjunction",
                }).format(savedPaths),
              })
            : t("feedback.success")
        );
        if (savedPaths[0]) {
          try {
            await showInFolder(savedPaths[0]);
          } catch (error) {
            console.warn("打开导出目录失败:", error);
          }
        }
        if (warnings.length > 0) {
          toast.warning(
            t("feedback.warnings", { count: warnings.length, amount: number(warnings.length) })
          );
          console.warn("整体导出警告:", warnings);
        }
      }
      onClose();
    } catch (error) {
      toast.error(t("feedback.failed", { reason: exportErrorReason(error) }));
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  });

  const labelClass = "text-ink-2 text-tau-sm font-semibold tracking-[0.02em]";
  const hintClass = "text-ink-3 text-tau-sm";

  const metaColumns = formats.epub ? "grid-cols-[1.3fr_1fr_0.7fr]" : "grid-cols-[1.3fr_1fr]";

  return (
    <Dialog
      title={t("batch.title")}
      context={scope.title || t("common.untitled")}
      open={open}
      onOpenChange={next => !next && onClose()}
      locked={exporting}
      width={900}
      height={640}
      impact={impact}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={exporting}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Download}
            loading={exporting}
            loadingText={t("progress.percent", { percent: number(exportProgress?.percent ?? 0) })}
            disabled={!canExport}
            onClick={handleConfirm}
          >
            {selectedFormats.length > 1
              ? t("batch.exportFiles", {
                  count: selectedFormats.length,
                  amount: number(selectedFormats.length),
                })
              : t("common.export")}
          </Button>
        </>
      }
    >
      <div className="mt-3.5 grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
        <div className="border-line-1 flex min-h-0 flex-col border-r">
          <div className="flex items-center gap-2 pr-5 pb-2 pl-6">
            <span className={labelClass}>{t("batch.content")}</span>
            <span className={cn(hintClass, "tabular-nums")}>
              {t("selection.count", {
                selected: number(selectedCount),
                total: number(exportableIds.length),
              })}
            </span>
            {exportableIds.length > 0 && (
              <button
                type="button"
                className="text-accent-text text-tau-sm ml-auto hover:underline"
                onClick={() =>
                  setCheckedKeys(selectedCount === exportableIds.length ? [] : exportableIds)
                }
              >
                {t(selectedCount === exportableIds.length ? "selection.none" : "selection.all")}
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-3 pb-2 pl-4">
            {loading ? (
              <div className={cn(hintClass, "py-6 text-center")}>{t("batch.loading")}</div>
            ) : exportableIds.length > 0 ? (
              <ExportCheckTree
                nodes={tree}
                checkedKeys={checkedKeys}
                onCheckedKeysChange={setCheckedKeys}
              />
            ) : tree.length > 0 ? (
              <ExportTreeEmpty />
            ) : (
              <div className={cn(hintClass, "py-6 text-center")}>{t("batch.noItems")}</div>
            )}
          </div>
          {exportableIds.length > 0 && (
            <p className="text-ink-3 text-tau-micro flex gap-1.5 px-6 pt-2.5 pb-3">
              <Info className="mt-[3px] size-3 shrink-0" />
              {t("selection.rememberHint")}
            </p>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-[18px] overflow-y-auto pr-6 pb-5 pl-[22px]">
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className={labelClass}>{t("format.title")}</span>
              <span className={hintClass}>{t("format.hint")}</span>
            </div>
            <FormatPicker
              formats={formats}
              onToggle={key => setFormats(prev => ({ ...prev, [key]: !prev[key] }))}
            />
          </section>

          <section className="flex flex-col gap-2">
            <span className={labelClass}>{t("layout.title")}</span>
            <div className="border-line-1 divide-line-1 rounded-tau-md divide-y border">
              <SettingRow
                title={t("layout.pageBreak")}
                description={t("layout.pageBreakHint")}
                checked={rule.pageBreak}
                disabled={!rulesApplicable}
                onCheckedChange={pageBreak => setRule(prev => ({ ...prev, pageBreak }))}
              />
              <SettingRow
                title={t("layout.asHeading")}
                description={t("layout.asHeadingHint")}
                checked={rule.asHeading}
                disabled={!rulesApplicable}
                onCheckedChange={asHeading => setRule(prev => ({ ...prev, asHeading }))}
                extra={
                  <Select
                    size="sm"
                    className="w-[72px]"
                    aria-label={t("layout.headingLevel")}
                    value={rule.headingLevel}
                    disabled={!rulesApplicable || !rule.asHeading}
                    onValueChange={value =>
                      setRule(prev => ({
                        ...prev,
                        headingLevel: value as BatchExportRule["headingLevel"],
                      }))
                    }
                    options={[
                      { value: 1, label: "H1" },
                      { value: 2, label: "H2" },
                      { value: 3, label: "H3" },
                    ]}
                  />
                }
              />
              {formats.pdf && (
                <>
                  <SettingRow
                    title={t("layout.outline")}
                    formatTag="PDF"
                    description={t("layout.outlineHint")}
                    checked={pdfSettings.outline}
                    onCheckedChange={outline => setPdfSettings(prev => ({ ...prev, outline }))}
                  />
                  <SettingRow
                    title={t("layout.toc")}
                    formatTag="PDF"
                    description={t(rule.asHeading ? "layout.tocHint" : "layout.tocRequiresHeading")}
                    checked={pdfSettings.tocPage}
                    disabled={!rule.asHeading}
                    onCheckedChange={tocPage => setPdfSettings(prev => ({ ...prev, tocPage }))}
                  />
                </>
              )}
            </div>
            {!rulesApplicable && (
              <span className={cn(hintClass, "flex items-center gap-1.5")}>
                <Info className="size-3 shrink-0" />
                {t("layout.zipHint")}
              </span>
            )}
          </section>

          <div className={cn("grid gap-3", metaColumns)}>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={labelClass}>
                {t(needsBookMeta ? "common.bookTitle" : "common.fileName")}
              </span>
              <Input
                value={bookTitle}
                placeholder={t("common.required")}
                onChange={event => setBookTitle(event.target.value)}
              />
            </label>
            {needsBookMeta && (
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className={labelClass}>
                  {t("meta.author")}{" "}
                  <span className="text-ink-3 font-normal tracking-normal">
                    {t("common.optional")}
                  </span>
                </span>
                <Input
                  value={author}
                  placeholder={t("meta.authorHint")}
                  onChange={event => setAuthor(event.target.value)}
                />
              </label>
            )}
            {formats.epub && (
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className={labelClass}>
                  {t("meta.language")}{" "}
                  <span className="text-ink-3 font-normal tracking-normal">EPUB</span>
                </span>
                <Input
                  value={language}
                  placeholder="zh-CN"
                  onChange={event => setLanguage(event.target.value)}
                />
              </label>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};

export default BatchExportModal;
