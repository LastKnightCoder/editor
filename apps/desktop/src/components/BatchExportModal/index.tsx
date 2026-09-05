import { useEffect, useMemo, useState, type ComponentType } from "react";
import { App, Checkbox, Select, Tree } from "antd";
import type { TreeDataNode } from "antd";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import {
  MdDescription,
  MdFolderZip,
  MdMenuBook,
  MdPictureAsPdf,
} from "react-icons/md";
import {
  exportEpubWithDialog,
  exportPdfWithDialog,
  saveFileWithDialog,
  showInFolder,
} from "@/commands";
import CustomModal from "@/components/CustomModal";
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
    iconClass: "text-red-500",
  },
  {
    key: "epub",
    label: "EPUB",
    description: "电子书格式，阅读器中翻阅",
    icon: MdMenuBook,
    iconClass: "text-teal-500",
  },
  {
    key: "markdown",
    label: "Markdown",
    description: "合并为单个 .md 文件",
    icon: MdDescription,
    iconClass: "text-sky-500",
  },
  {
    key: "markdownZip",
    label: "Markdown ZIP",
    description: "保持目录结构，逐篇打包",
    icon: MdFolderZip,
    iconClass: "text-amber-500",
  },
];

const normalizeText = (value?: string) => (value || "").trim();

const toTreeData = (nodes: BatchExportTreeNode[]): TreeDataNode[] =>
  nodes.map((node) => ({
    key: node.id,
    title: node.exportable
      ? node.title
      : `${node.title}（${node.disabledReason || "不参与导出"}）`,
    disableCheckbox: !node.exportable,
    children: toTreeData(node.children),
  }));

const BatchExportModal = (props: BatchExportModalProps) => {
  const { open, onClose, scope } = props;
  const { message } = App.useApp();
  const dbName = useSettingStore((state) => state.setting.database.active);

  const storageKey = useMemo(
    () => `batch-export-settings:${dbName}:${scope.type}:${scope.id}`,
    [dbName, scope.type, scope.id],
  );

  const [remembered, setRemembered] = useLocalStorageState<
    BatchExportSettings | undefined
  >(storageKey, { defaultValue: undefined });

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
      .then((nodes) => {
        if (cancelled) {
          return;
        }
        setTree(nodes);
        const exportableIds = collectExportableIds(nodes);
        const excluded = new Set(remembered?.excludedIds || []);
        setCheckedKeys(exportableIds.filter((id) => !excluded.has(id)));
        setFormats(remembered?.formats || DEFAULT_SETTINGS.formats);
        setRule(remembered?.rule || DEFAULT_SETTINGS.rule);
        setPdfSettings(remembered?.pdf || DEFAULT_PDF_SETTINGS);
        setBookTitle(scope.title || "未命名文档");
        setAuthor(remembered?.epubMeta?.author || "");
        setLanguage(remembered?.epubMeta?.language || "zh-CN");
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const msg = error instanceof Error ? error.message : String(error);
        message.error(`加载内容失败：${msg}`);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // remembered 仅在打开时读取一次，避免勾选过程中被回写覆盖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope.type, scope.id, scope.title, storageKey]);

  const treeData = useMemo(() => toTreeData(tree), [tree]);
  const exportableIds = useMemo(() => collectExportableIds(tree), [tree]);
  const selectedCount = useMemo(
    () => checkedKeys.filter((id) => exportableIds.includes(id)).length,
    [checkedKeys, exportableIds],
  );

  const hasFormat =
    formats.pdf || formats.epub || formats.markdown || formats.markdownZip;
  // 导出规则只作用于 PDF / EPUB / 合并 Markdown；仅选 ZIP 时不适用
  const rulesApplicable = formats.pdf || formats.epub || formats.markdown;
  const hasRule = !rulesApplicable || rule.pageBreak || rule.asHeading;
  const canExport =
    !loading &&
    selectedCount > 0 &&
    hasFormat &&
    hasRule &&
    normalizeText(bookTitle).length > 0;

  const handleConfirm = useMemoizedFn(async () => {
    const title = normalizeText(bookTitle);
    if (!title) {
      message.error("书名不能为空");
      return;
    }

    const chapters = flattenSelectedChapters(tree, new Set(checkedKeys));
    if (chapters.filter((chapter) => !chapter.isGroup).length === 0) {
      message.error("请至少选择一篇要导出的内容");
      return;
    }

    setExporting(true);
    try {
      const savedPaths: string[] = [];
      const warnings: string[] = [];
      let canceled = false;

      // 进度按处理单元推进：每章序列化 / 每个 ZIP 文件各 1 单元，每种格式收尾（生成文件）再 1 单元
      const contentCount = chapters.filter(
        (chapter) => !chapter.isGroup,
      ).length;
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
        const percent = Math.min(
          99,
          Math.round(((finishedUnits + processed) / totalUnits) * 100),
        );
        setExportProgress({ percent, label });
      };

      if (formats.epub) {
        const metadata: EpubMetadataInput = {
          title,
          author: normalizeText(author),
          language: normalizeText(language) || "zh-CN",
          description: "",
        };
        const { payload, warnings: epubWarnings } = await buildBatchEpubPayload(
          {
            chapters,
            metadata,
            rule,
            onProgress: (processed, _total, label) => report(processed, label),
          },
        );
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
          (processed, _total, label) => report(processed, label),
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
        excludedIds: exportableIds.filter((id) => !checkedKeys.includes(id)),
        formats,
        rule,
        pdf: pdfSettings,
        epubMeta: {
          author: normalizeText(author) || undefined,
          language: normalizeText(language) || "zh-CN",
        },
      });

      if (canceled) {
        message.info("已取消导出");
      } else {
        message.success(
          savedPaths.length > 0
            ? `导出成功，已保存：${savedPaths.join("、")}`
            : "导出成功",
        );
        if (savedPaths[0]) {
          try {
            await showInFolder(savedPaths[0]);
          } catch (error) {
            console.warn("打开导出目录失败:", error);
          }
        }
        if (warnings.length > 0) {
          message.warning(`导出完成，但有 ${warnings.length} 条警告`);
          console.warn("整体导出警告:", warnings);
        }
      }
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      message.error(`导出失败：${msg}`);
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  });

  const inputClass =
    "w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500";
  const labelClass =
    "text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400";

  return (
    <CustomModal
      title={`整体导出 - ${scope.title || "未命名"}`}
      subtitle="勾选要导出的内容，可同时选择多种格式；排除项会按数据库记住，下次打开自动应用。"
      open={open}
      onCancel={onClose}
      onOk={handleConfirm}
      okText={exporting ? `导出中 ${exportProgress?.percent ?? 0}%` : "导出"}
      confirmLoading={exporting}
      okButtonProps={{ disabled: !canExport }}
      width={880}
      bodyClassName="p-5 overflow-y-auto"
    >
      <div className="grid grid-cols-[minmax(230px,290px)_1fr] gap-5 items-start">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className={labelClass}>导出内容</label>
            <span className="text-xs text-gray-500 dark:text-slate-400">
              已选 {selectedCount} / 共 {exportableIds.length} 篇
            </span>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-zinc-950 px-3 py-2 max-h-[440px] min-h-[280px] overflow-y-auto">
            {loading ? (
              <div className="py-6 text-center text-xs text-gray-500 dark:text-slate-400">
                正在加载内容...
              </div>
            ) : treeData.length > 0 ? (
              <Tree
                checkable
                defaultExpandAll
                selectable={false}
                treeData={treeData}
                checkedKeys={checkedKeys}
                onCheck={(keys) => setCheckedKeys(keys as number[])}
              />
            ) : (
              <div className="py-6 text-center text-xs text-gray-500 dark:text-slate-400">
                暂无可导出的内容
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>导出格式</label>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_CARDS.map((card) => {
                const selected = formats[card.key];
                const Icon = card.icon;
                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() =>
                      setFormats((prev) => ({
                        ...prev,
                        [card.key]: !prev[card.key],
                      }))
                    }
                    className={`relative flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      selected
                        ? "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-500/10"
                        : "border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-zinc-950 hover:border-gray-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 mt-0.5 shrink-0 ${card.iconClass}`}
                    />
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium text-gray-800 dark:text-white">
                        {card.label}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-slate-400">
                        {card.description}
                      </span>
                    </span>
                    {selected && (
                      <span className="absolute top-2 right-2 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-indigo-500 text-white">
                        <svg
                          className="w-3 h-3"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                        >
                          <path
                            d="M5 13l4 4L19 7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
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
                <span className="text-xs text-gray-400 dark:text-slate-500">
                  ZIP 按目录分文件导出，规则不适用
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-zinc-950 px-3.5 py-2.5">
              <Checkbox
                checked={rule.pageBreak}
                disabled={!rulesApplicable}
                onChange={(event) =>
                  setRule((prev) => ({
                    ...prev,
                    pageBreak: event.target.checked,
                  }))
                }
              >
                每个文档分页（EPUB 中每个文档天然一章）
              </Checkbox>
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={rule.asHeading}
                  disabled={!rulesApplicable}
                  onChange={(event) =>
                    setRule((prev) => ({
                      ...prev,
                      asHeading: event.target.checked,
                    }))
                  }
                >
                  文档标题作为标题插入正文
                </Checkbox>
                <Select
                  size="small"
                  value={rule.headingLevel}
                  disabled={!rulesApplicable || !rule.asHeading}
                  onChange={(value) =>
                    setRule((prev) => ({
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
              <div className="flex flex-col gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-zinc-950 px-3.5 py-2.5">
                <Checkbox
                  checked={pdfSettings.outline}
                  onChange={(event) =>
                    setPdfSettings((prev) => ({
                      ...prev,
                      outline: event.target.checked,
                    }))
                  }
                >
                  生成书签导航（PDF 阅读器侧边栏大纲，按标题层级展示）
                </Checkbox>
                <Checkbox
                  checked={pdfSettings.tocPage && rule.asHeading}
                  disabled={!rule.asHeading}
                  onChange={(event) =>
                    setPdfSettings((prev) => ({
                      ...prev,
                      tocPage: event.target.checked,
                    }))
                  }
                >
                  插入目录页（正文开头单独一页，点击条目跳转）
                </Checkbox>
                {!rule.asHeading && (
                  <span className="text-xs text-gray-400 dark:text-slate-500">
                    目录页需开启“文档标题作为标题插入正文”
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>书名</label>
              <input
                type="text"
                value={bookTitle}
                placeholder="请输入书名"
                onChange={(event) => setBookTitle(event.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>作者</label>
              <input
                type="text"
                value={author}
                placeholder="可选"
                onChange={(event) => setAuthor(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {formats.epub && (
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>语言（EPUB）</label>
              <input
                type="text"
                value={language}
                placeholder="例如 zh-CN / en"
                onChange={(event) => setLanguage(event.target.value)}
                className={inputClass}
              />
            </div>
          )}
        </div>
      </div>

      {exporting && exportProgress && (
        <div className="mt-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-slate-400">
            <span className="truncate min-w-0">
              {exportProgress.label || "正在导出..."}
            </span>
            <span className="shrink-0 tabular-nums">
              {exportProgress.percent}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${exportProgress.percent}%` }}
            />
          </div>
        </div>
      )}
    </CustomModal>
  );
};

export default BatchExportModal;
