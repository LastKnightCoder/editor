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
          <span className="font-tau-mono text-ink-2 border-line-1 rounded-[4px] border px-[5px] text-[10px] font-semibold leading-[1.5] tracking-[0.04em]">
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
        toast.error(`加载内容失败：${msg}`);
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
    ? "正在加载内容..."
    : exportableIds.length === 0
      ? "这个项目里没有文档"
      : selectedCount === 0
        ? "至少勾选一篇内容"
        : selectedFormats.length === 0
          ? "至少选择一种格式"
          : !hasRule
            ? "至少开启一项排版规则"
            : normalizeText(bookTitle).length === 0
              ? `请填写${needsBookMeta ? "书名" : "文件名"}`
              : "";
  const canExport = !blockReason;
  const impact = exporting
    ? exportProgress?.label || "正在导出..."
    : blockReason ||
      `将导出 ${selectedCount} 篇 → ${selectedFormats.map(option => option.label).join("、")}`;

  const handleConfirm = useMemoizedFn(async () => {
    const title = normalizeText(bookTitle);
    if (!title) {
      toast.error("书名不能为空");
      return;
    }

    const chapters = flattenSelectedChapters(tree, new Set(checkedKeys));
    if (chapters.filter(chapter => !chapter.isGroup).length === 0) {
      toast.error("请至少选择一篇要导出的内容");
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
      const report = (processed: number, label?: string) => {
        if (totalUnits <= 0) {
          return;
        }
        const percent = Math.min(99, Math.round(((finishedUnits + processed) / totalUnits) * 100));
        setExportProgress({ percent, label });
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
        report(epubUnits - 1, "正在生成 EPUB 文件...");
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
        report(pdfUnits - 1, "正在生成 PDF 文件...");
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
        report(0, "正在打包资源...");
        const merged = await localizeChaptersForMerge(chapters);
        warnings.push(...merged.warnings);
        report(0, "正在生成 Markdown...");
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
        report(0, "正在打包资源...");
        const zip = await buildMarkdownZipBytes(
          tree,
          new Set(checkedKeys),
          (processed, _total, label) => report(processed, label)
        );
        warnings.push(...zip.warnings);
        report(zipUnits - 1, "正在保存 ZIP 文件...");
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
        toast.info("已取消导出");
      } else {
        toast.success(
          savedPaths.length > 0 ? `导出成功，已保存：${savedPaths.join("、")}` : "导出成功"
        );
        if (savedPaths[0]) {
          try {
            await showInFolder(savedPaths[0]);
          } catch (error) {
            console.warn("打开导出目录失败:", error);
          }
        }
        if (warnings.length > 0) {
          toast.warning(`导出完成，但有 ${warnings.length} 条警告`);
          console.warn("整体导出警告:", warnings);
        }
      }
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`导出失败：${msg}`);
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
      title="整体导出"
      context={scope.title || "未命名"}
      open={open}
      onOpenChange={next => !next && onClose()}
      locked={exporting}
      width={900}
      height={640}
      impact={impact}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={exporting}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Download}
            loading={exporting}
            loadingText={`导出中 ${exportProgress?.percent ?? 0}%`}
            disabled={!canExport}
            onClick={handleConfirm}
          >
            {selectedFormats.length > 1 ? `导出 ${selectedFormats.length} 个文件` : "导出"}
          </Button>
        </>
      }
    >
      <div className="mt-3.5 grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
        <div className="border-line-1 flex min-h-0 flex-col border-r">
          <div className="flex items-center gap-2 pb-2 pl-6 pr-5">
            <span className={labelClass}>导出内容</span>
            <span className={cn(hintClass, "tabular-nums")}>
              {selectedCount} / {exportableIds.length} 篇
            </span>
            {exportableIds.length > 0 && (
              <button
                type="button"
                className="text-accent-text text-tau-sm ml-auto hover:underline"
                onClick={() =>
                  setCheckedKeys(selectedCount === exportableIds.length ? [] : exportableIds)
                }
              >
                {selectedCount === exportableIds.length ? "全不选" : "全选"}
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-2 pl-4 pr-3">
            {loading ? (
              <div className={cn(hintClass, "py-6 text-center")}>正在加载内容...</div>
            ) : exportableIds.length > 0 ? (
              <ExportCheckTree
                nodes={tree}
                checkedKeys={checkedKeys}
                onCheckedKeysChange={setCheckedKeys}
              />
            ) : tree.length > 0 ? (
              <ExportTreeEmpty />
            ) : (
              <div className={cn(hintClass, "py-6 text-center")}>项目里还没有条目</div>
            )}
          </div>
          {exportableIds.length > 0 && (
            <p className="text-ink-3 text-tau-micro flex gap-1.5 px-6 pb-3 pt-2.5">
              <Info className="mt-[3px] size-3 shrink-0" />
              取消勾选的条目会在导出后记住，下次打开自动排除
            </p>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-[18px] overflow-y-auto pb-5 pl-[22px] pr-6">
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className={labelClass}>格式</span>
              <span className={hintClass}>可多选，每种生成一个文件</span>
            </div>
            <FormatPicker
              formats={formats}
              onToggle={key => setFormats(prev => ({ ...prev, [key]: !prev[key] }))}
            />
          </section>

          <section className="flex flex-col gap-2">
            <span className={labelClass}>排版</span>
            <div className="border-line-1 divide-line-1 rounded-tau-md divide-y border">
              <SettingRow
                title="每篇文档另起一页"
                description="EPUB 中每篇天然是一章"
                checked={rule.pageBreak}
                disabled={!rulesApplicable}
                onCheckedChange={pageBreak => setRule(prev => ({ ...prev, pageBreak }))}
              />
              <SettingRow
                title="把文档标题写进正文"
                description="顶层文档用所选级别，子文档逐级下沉"
                checked={rule.asHeading}
                disabled={!rulesApplicable}
                onCheckedChange={asHeading => setRule(prev => ({ ...prev, asHeading }))}
                extra={
                  <Select
                    size="sm"
                    className="w-[72px]"
                    aria-label="标题级别"
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
                    title="书签导航"
                    formatTag="PDF"
                    description="阅读器侧边栏按标题层级展开"
                    checked={pdfSettings.outline}
                    onCheckedChange={outline => setPdfSettings(prev => ({ ...prev, outline }))}
                  />
                  <SettingRow
                    title="目录页"
                    formatTag="PDF"
                    description={
                      rule.asHeading
                        ? "正文前单独一页，条目可点击跳转"
                        : "需先开启「把文档标题写进正文」"
                    }
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
                Markdown 包按目录逐篇保存，以上规则不适用
              </span>
            )}
          </section>

          <div className={cn("grid gap-3", metaColumns)}>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={labelClass}>{needsBookMeta ? "书名" : "文件名"}</span>
              <Input
                value={bookTitle}
                placeholder="必填"
                onChange={event => setBookTitle(event.target.value)}
              />
            </label>
            {needsBookMeta && (
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className={labelClass}>
                  作者 <span className="text-ink-3 font-normal tracking-normal">可选</span>
                </span>
                <Input
                  value={author}
                  placeholder="写入书籍元数据"
                  onChange={event => setAuthor(event.target.value)}
                />
              </label>
            )}
            {formats.epub && (
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className={labelClass}>
                  语言 <span className="text-ink-3 font-normal tracking-normal">EPUB</span>
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
