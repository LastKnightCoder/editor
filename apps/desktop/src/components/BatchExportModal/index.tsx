import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Button, Checkbox, Dialog, DialogBody, Input, Select, cn, toast } from "@tau/ui";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { MdDescription, MdFolderZip, MdMenuBook, MdPictureAsPdf } from "react-icons/md";
import { Check } from "lucide-react";
import {
  exportEpubWithDialog,
  exportPdfWithDialog,
  saveFileWithDialog,
  showInFolder,
} from "@/commands";
import useSettingStore from "@/stores/useSettingStore";
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
  type BatchExportTreeNode,
} from "@/utils/batch-export";

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

type FormatKey = keyof BatchExportSettings["formats"];

interface FormatCard {
  key: FormatKey;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
}

const FORMAT_CARDS: FormatCard[] = [
  {
    key: "pdf",
    label: "PDF",
    description: "适合打印分享，支持目录导航",
    icon: MdPictureAsPdf,
    iconClass: "text-danger",
  },
  {
    key: "epub",
    label: "EPUB",
    description: "电子书格式，阅读器中翻阅",
    icon: MdMenuBook,
    iconClass: "text-ok",
  },
  {
    key: "markdown",
    label: "Markdown",
    description: "合并为单个 .md 文件",
    icon: MdDescription,
    iconClass: "text-info",
  },
  {
    key: "markdownZip",
    label: "Markdown ZIP",
    description: "保持目录结构，逐篇打包",
    icon: MdFolderZip,
    iconClass: "text-warn",
  },
];

const normalizeText = (value?: string) => (value || "").trim();

/** 勾选子树内全部可导出条目的 id（与 collectExportableIds 同集） */
const collectSubtreeExportableIds = (node: BatchExportTreeNode): number[] => [
  ...(node.exportable ? [node.id] : []),
  ...node.children.flatMap(collectSubtreeExportableIds),
];

/**
 * 勾选树（antd Tree 的就地替代）：checkedKeys 语义与原实现一致——
 * 集合内容为「被勾选的 exportable 节点 id（父 + 子）」，勾父节点级联全选子树。
 * 非 exportable 节点禁勾，仅作分组展示（flattenSelectedChapters 按 hasSelectedDescendant 处理）。
 */
const ExportCheckTree = ({
  nodes,
  checkedKeys,
  onCheckedKeysChange,
}: {
  nodes: BatchExportTreeNode[];
  checkedKeys: number[];
  onCheckedKeysChange: (keys: number[]) => void;
}) => {
  const checkedSet = useMemo(() => new Set(checkedKeys), [checkedKeys]);

  const stateOf = (node: BatchExportTreeNode): "checked" | "indeterminate" | "unchecked" => {
    const ids = collectSubtreeExportableIds(node);
    if (ids.length === 0) return "unchecked";
    const hit = ids.filter(id => checkedSet.has(id)).length;
    return hit === ids.length ? "checked" : hit > 0 ? "indeterminate" : "unchecked";
  };

  const toggle = (node: BatchExportTreeNode, next: boolean) => {
    const ids = new Set(collectSubtreeExportableIds(node));
    onCheckedKeysChange(
      next ? [...new Set([...checkedKeys, ...ids])] : checkedKeys.filter(id => !ids.has(id))
    );
  };

  const renderNode = (node: BatchExportTreeNode, level: number) => (
    <div key={node.id}>
      <div className="flex items-start gap-1.5 py-[3px]" style={{ paddingLeft: level * 18 }}>
        <Checkbox
          checked={stateOf(node) === "checked"}
          indeterminate={stateOf(node) === "indeterminate"}
          disabled={!node.exportable}
          onChange={event => toggle(node, event.target.checked)}
        />
        <span
          className={cn("text-[13px] leading-6", node.exportable ? "text-ink-1" : "text-ink-3")}
        >
          {node.exportable ? node.title : `${node.title}（${node.disabledReason || "不参与导出"}）`}
        </span>
      </div>
      {node.children.map(child => renderNode(child, level + 1))}
    </div>
  );

  return <div>{nodes.map(node => renderNode(node, 0))}</div>;
};

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

  const hasFormat = formats.pdf || formats.epub || formats.markdown || formats.markdownZip;
  // 导出规则只作用于 PDF / EPUB / 合并 Markdown；仅选 ZIP 时不适用
  const rulesApplicable = formats.pdf || formats.epub || formats.markdown;
  const hasRule = !rulesApplicable || rule.pageBreak || rule.asHeading;
  const canExport =
    !loading && selectedCount > 0 && hasFormat && hasRule && normalizeText(bookTitle).length > 0;

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
        report(0, "正在生成 Markdown...");
        const markdown = buildMergedMarkdown(chapters, rule);
        const result = await saveFileWithDialog({
          defaultFileName: `${title}.md`,
          filters: [{ name: "Markdown", extensions: ["md"] }],
          data: markdown,
        });
        finishedUnits += markdownUnits;
        if (result.canceled) {
          canceled = true;
        } else if (result.filePath) {
          savedPaths.push(result.filePath);
        }
      }

      if (formats.markdownZip && !canceled) {
        const zipBytes = await buildMarkdownZipBytes(
          tree,
          new Set(checkedKeys),
          (processed, _total, label) => report(processed, label)
        );
        report(zipUnits - 1, "正在保存 ZIP 文件...");
        const result = await saveFileWithDialog({
          defaultFileName: `${title}.zip`,
          filters: [{ name: "ZIP", extensions: ["zip"] }],
          data: zipBytes,
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

  const labelClass = "text-ink-2 text-tau-meta font-[550]";
  const hintClass = "text-ink-3 text-tau-meta";
  const boxClass = "bg-sunken border-line-1 rounded-tau-md border";

  return (
    <Dialog
      title="整体导出"
      context={scope.title || "未命名"}
      subtitle="勾选要导出的内容，可同时选择多种格式；排除项会按数据库记住，下次打开自动应用。"
      open={open}
      onOpenChange={next => !next && onClose()}
      locked={exporting}
      width={880}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={exporting}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={exporting}
            loadingText={`导出中 ${exportProgress?.percent ?? 0}%`}
            disabled={!canExport}
            onClick={handleConfirm}
          >
            导出
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="grid grid-cols-[minmax(230px,290px)_1fr] items-start gap-5">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className={labelClass}>导出内容</label>
              <span className={hintClass}>
                已选 {selectedCount} / 共 {exportableIds.length} 篇
              </span>
            </div>
            <div className={cn(boxClass, "max-h-[440px] min-h-[280px] overflow-y-auto px-3 py-2")}>
              {loading ? (
                <div className={cn(hintClass, "py-6 text-center")}>正在加载内容...</div>
              ) : tree.length > 0 ? (
                <ExportCheckTree
                  nodes={tree}
                  checkedKeys={checkedKeys}
                  onCheckedKeysChange={setCheckedKeys}
                />
              ) : (
                <div className={cn(hintClass, "py-6 text-center")}>暂无可导出的内容</div>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>导出格式</label>
              <div className="grid grid-cols-2 gap-2">
                {FORMAT_CARDS.map(card => {
                  const selected = formats[card.key];
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.key}
                      type="button"
                      onClick={() =>
                        setFormats(prev => ({
                          ...prev,
                          [card.key]: !prev[card.key],
                        }))
                      }
                      aria-pressed={selected}
                      className={cn(
                        "rounded-tau-md ease-tau-out relative flex cursor-pointer items-start gap-2.5 border p-3 text-left transition-[background,border-color] duration-[140ms]",
                        selected
                          ? "border-accent bg-accent-soft"
                          : "border-line-1 bg-surface hover:border-ink-3"
                      )}
                    >
                      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${card.iconClass}`} />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-ink-1 text-[13px] font-[550]">{card.label}</span>
                        <span className={hintClass}>{card.description}</span>
                      </span>
                      {selected && (
                        <span className="bg-accent text-ink-inverse absolute right-2 top-2 grid size-[18px] place-items-center rounded-full">
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className={labelClass}>导出规则</label>
                {!rulesApplicable && (
                  <span className={hintClass}>ZIP 按目录分文件导出，规则不适用</span>
                )}
              </div>
              <div className={cn(boxClass, "flex flex-col gap-2 px-3.5 py-2.5")}>
                <Checkbox
                  checked={rule.pageBreak}
                  disabled={!rulesApplicable}
                  onChange={event =>
                    setRule(prev => ({
                      ...prev,
                      pageBreak: event.target.checked,
                    }))
                  }
                  label="每个文档分页（EPUB 中每个文档天然一章）"
                />
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={rule.asHeading}
                    disabled={!rulesApplicable}
                    onChange={event =>
                      setRule(prev => ({
                        ...prev,
                        asHeading: event.target.checked,
                      }))
                    }
                    label="文档标题作为标题插入正文"
                  />
                  <Select
                    className="w-[80px]"
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
                </div>
              </div>
            </div>

            {formats.pdf && (
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>PDF 目录</label>
                <div className={cn(boxClass, "flex flex-col gap-2 px-3.5 py-2.5")}>
                  <Checkbox
                    checked={pdfSettings.outline}
                    onChange={event =>
                      setPdfSettings(prev => ({
                        ...prev,
                        outline: event.target.checked,
                      }))
                    }
                    label="生成书签导航（PDF 阅读器侧边栏大纲，按标题层级展示）"
                  />
                  <Checkbox
                    checked={pdfSettings.tocPage && rule.asHeading}
                    disabled={!rule.asHeading}
                    onChange={event =>
                      setPdfSettings(prev => ({
                        ...prev,
                        tocPage: event.target.checked,
                      }))
                    }
                    label="插入目录页（正文开头单独一页，点击条目跳转）"
                  />
                  {!rule.asHeading && (
                    <span className={hintClass}>目录页需开启“文档标题作为标题插入正文”</span>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>书名</label>
                <Input
                  value={bookTitle}
                  placeholder="请输入书名"
                  onChange={event => setBookTitle(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>作者</label>
                <Input
                  value={author}
                  placeholder="可选"
                  onChange={event => setAuthor(event.target.value)}
                />
              </div>
            </div>

            {formats.epub && (
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>语言（EPUB）</label>
                <Input
                  value={language}
                  placeholder="例如 zh-CN / en"
                  onChange={event => setLanguage(event.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        {exporting && exportProgress && (
          <div className="mt-4 flex flex-col gap-1.5">
            <div className={cn(hintClass, "flex items-center justify-between gap-3")}>
              <span className="min-w-0 truncate">{exportProgress.label || "正在导出..."}</span>
              <span className="shrink-0 tabular-nums">{exportProgress.percent}%</span>
            </div>
            <div className="bg-track h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-accent ease-tau-out h-full rounded-full transition-[width] duration-300"
                style={{ width: `${exportProgress.percent}%` }}
              />
            </div>
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
};

export default BatchExportModal;
