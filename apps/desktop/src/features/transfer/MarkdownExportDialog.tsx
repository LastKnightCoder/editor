import {
  useExportI18n,
  getExportLocale,
  exportErrorReason,
  type ExportMessageKey,
} from "./i18n-export";
/**
 * 导出为 Markdown 压缩包（迁出）：范围（项目 / 文章 / 卡片 / 全部）→ 勾选 → 资源、互链写法、frontmatter。
 * 只做 Markdown；项目的 PDF / EPUB 仍走项目卡片 ⋯ 的「整体导出」。偏好按本机记忆。
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalStorageState } from "ahooks";
import { Download } from "lucide-react";
import { Button, Dialog, Input, Loading, Radio, RadioGroup, Switch, cn, toast } from "@tau/ui";
import { CheckTree } from "@/components/CheckTree";
import {
  DEFAULT_EXPORT_SETTINGS,
  SCOPE_FILE_NAME,
  exportMarkdownBundle,
  loadExportCatalog,
  type ExportScope,
  type MarkdownExportSettings,
} from "@/services/markdown-export";
import useSettingStore from "@/stores/useSettingStore";
import { collectExportableIds, type BatchExportTreeNode } from "@/utils/batch-export";
import type { MarkdownExportRequest } from "@/app/transferStore";

const SCOPES: ExportScope[] = ["project", "article", "card", "all"];

/** 叶子超过这个数时分组默认折叠 */
const COLLAPSE_THRESHOLD = 120;

const labelClass = "text-ink-2 text-tau-sm font-semibold tracking-[0.02em]";
const hintClass = "text-ink-3 text-tau-sm";

const collectGroupIds = (nodes: BatchExportTreeNode[]): number[] =>
  nodes.flatMap(node =>
    node.children.length > 0 ? [node.id, ...collectGroupIds(node.children)] : []
  );

const collectSubtree = (node: BatchExportTreeNode): number[] => collectExportableIds([node]);

const today = () => {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
};

export function MarkdownExportDialog({
  request,
  onClose,
}: {
  request: MarkdownExportRequest;
  onClose: () => void;
}) {
  const { t } = useExportI18n();
  const number = (value: number) => value.toLocaleString(getExportLocale());
  const databaseName = useSettingStore(s => s.setting.database.active);
  const [scope, setScope] = useState<ExportScope>(request.scope ?? "project");
  const [stored, setStored] = useLocalStorageState<MarkdownExportSettings>(
    "markdown-export-settings",
    { defaultValue: DEFAULT_EXPORT_SETTINGS }
  );
  const settings = { ...DEFAULT_EXPORT_SETTINGS, ...stored };
  const update = (patch: Partial<MarkdownExportSettings>) => setStored({ ...settings, ...patch });

  /** 每个范围各记一份勾选（未动过的范围默认全选） */
  const [checkedByScope, setCheckedByScope] = useState<Partial<Record<ExportScope, number[]>>>({});
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState<{
    percent: number;
    label?: string;
    stage?: ExportMessageKey;
  } | null>(null);

  const catalog = useQuery({
    queryKey: ["markdown-export", databaseName, scope],
    queryFn: () => loadExportCatalog(scope, databaseName),
    staleTime: 0,
    gcTime: 0,
  });
  const tree = useMemo(() => catalog.data?.tree ?? [], [catalog.data]);
  const scopeNodes = catalog.data?.scopeNodes;
  const displayTree = useMemo(
    () =>
      tree.map(node => {
        const kind = scopeNodes?.get(node.id);
        return kind ? { ...node, title: t(`scope.${kind}`) } : node;
      }),
    [tree, scopeNodes, t]
  );
  const exportableIds = useMemo(() => collectExportableIds(tree), [tree]);

  const defaultChecked = useMemo(() => {
    if (scope !== "project" || request.projectId === undefined || !catalog.data) {
      return exportableIds;
    }
    const projectNode = tree.find(
      node => catalog.data.projectNodes.get(node.id) === request.projectId
    );
    return projectNode ? collectSubtree(projectNode) : exportableIds;
  }, [scope, request.projectId, catalog.data, tree, exportableIds]);

  const checkedKeys = checkedByScope[scope] ?? defaultChecked;
  const selectedCount = checkedKeys.length;
  const collapsedIds = useMemo(
    () => (exportableIds.length > COLLAPSE_THRESHOLD ? collectGroupIds(tree) : []),
    [exportableIds.length, tree]
  );

  const defaultFileName = useMemo(() => {
    if (scope === "project" && request.projectId !== undefined && catalog.data) {
      const node = tree.find(item => catalog.data.projectNodes.get(item.id) === request.projectId);
      if (node) return `${node.title}-${today()}`;
    }
    return `${SCOPE_FILE_NAME[scope]}-${today()}`;
  }, [scope, request.projectId, catalog.data, tree]);

  const exporting = progress !== null;
  const blockReason = catalog.isLoading
    ? t("markdown.reading")
    : catalog.error
      ? t("markdown.readFailed")
      : exportableIds.length === 0
        ? t("markdown.empty", { scope: t(`scope.${scope}`) })
        : selectedCount === 0
          ? t("markdown.selectOne")
          : "";

  const run = async () => {
    setProgress({ percent: 0, stage: "progress.packing" });
    try {
      const result = await exportMarkdownBundle({
        tree,
        selectedIds: new Set(checkedKeys),
        fileName: fileName.trim() || defaultFileName,
        settings,
        onProgress: (processed, total, label) =>
          setProgress({ percent: Math.round((processed / Math.max(total, 1)) * 100), label }),
      });
      if (!result.filePath) {
        toast.info(t("feedback.canceled"));
        return;
      }
      if (result.warnings.length > 0) {
        console.warn("Markdown 导出警告:", result.warnings);
        toast.warning(
          t("feedback.markdownWarnings", {
            documents: number(result.fileCount),
            assets: number(result.warnings.length),
          })
        );
      } else {
        toast.success(
          t("feedback.markdownSuccess", {
            documents: number(result.fileCount),
            assets: number(result.assetCount),
          })
        );
      }
      onClose();
    } catch (error) {
      toast.error(t("feedback.failed", { reason: exportErrorReason(error) }));
    } finally {
      setProgress(null);
    }
  };

  const impact = exporting
    ? progress?.stage
      ? t(progress.stage)
      : progress?.label || t("progress.exporting")
    : blockReason || t("markdown.impact", { count: selectedCount, amount: number(selectedCount) });

  return (
    <Dialog
      title={t("markdown.title")}
      open
      onOpenChange={next => !next && onClose()}
      locked={exporting}
      width={860}
      height={620}
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
            loadingText={t("progress.percent", { percent: number(progress?.percent ?? 0) })}
            disabled={!!blockReason}
            onClick={() => void run()}
          >
            {t("common.export")}
          </Button>
        </>
      }
    >
      <div className="mt-3.5 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px]">
        <div className="border-line-1 flex min-h-0 flex-col border-r">
          <div className="flex flex-wrap items-center gap-1.5 pr-5 pb-2.5 pl-6">
            {SCOPES.map(key => (
              <button
                key={key}
                type="button"
                aria-pressed={scope === key}
                disabled={exporting}
                onClick={() => setScope(key)}
                className={cn(
                  "text-tau-sm rounded-full border px-3 py-0.5",
                  scope === key
                    ? "border-accent bg-accent-soft text-accent-text"
                    : "border-line-1 text-ink-2 hover:bg-hover"
                )}
              >
                {t(`scope.${key}`)}
              </button>
            ))}
            <span className={cn(hintClass, "ml-auto tabular-nums")}>
              {t("selection.count", {
                selected: number(selectedCount),
                total: number(exportableIds.length),
              })}
            </span>
            {exportableIds.length > 0 && (
              <button
                type="button"
                className="text-accent-text text-tau-sm hover:underline"
                onClick={() =>
                  setCheckedByScope(prev => ({
                    ...prev,
                    [scope]: selectedCount === exportableIds.length ? [] : exportableIds,
                  }))
                }
              >
                {t(selectedCount === exportableIds.length ? "selection.none" : "selection.all")}
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-3 pb-3 pl-4">
            {catalog.isLoading ? (
              <Loading />
            ) : catalog.error ? (
              <p role="alert" className="text-danger text-tau-meta py-6 text-center">
                {t("markdown.readFailedReason", {
                  reason:
                    catalog.error instanceof Error
                      ? catalog.error.message
                      : t("common.unknownError"),
                })}
              </p>
            ) : exportableIds.length === 0 ? (
              <p className={cn(hintClass, "py-16 text-center")}>
                {t("markdown.empty", { scope: t(`scope.${scope}`) })}
              </p>
            ) : (
              <CheckTree
                key={scope}
                nodes={displayTree}
                checkedKeys={checkedKeys}
                onCheckedKeysChange={keys =>
                  setCheckedByScope(prev => ({ ...prev, [scope]: keys }))
                }
                isSelectable={node => node.exportable}
                getTag={node =>
                  node.exportable && node.empty
                    ? { label: t("selection.empty"), hint: t("selection.emptyMarkdownHint") }
                    : null
                }
                initiallyCollapsed={collapsedIds}
              />
            )}
          </div>
          <p className="text-ink-3 text-tau-micro px-6 pt-2 pb-3">{t("selection.structureHint")}</p>
        </div>

        <div className="flex min-h-0 flex-col gap-[18px] overflow-y-auto pr-6 pb-5 pl-[22px]">
          <RadioGroup
            label={t("assets.title")}
            value={settings.assets}
            onValueChange={value => update({ assets: value })}
          >
            <Radio value="pack" label={t("assets.pack")} description={t("assets.packHint")} />
            <Radio value="keep" label={t("assets.keep")} description={t("assets.keepHint")} />
          </RadioGroup>
          <div className="-mt-2.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "text-tau-body",
                  settings.assets === "pack" ? "text-ink-1" : "text-ink-3"
                )}
              >
                {t("assets.remote")}
              </div>
              <div className={hintClass}>{t("assets.remoteHint")}</div>
            </div>
            <Switch
              size="sm"
              aria-label={t("assets.remote")}
              checked={settings.includeRemote && settings.assets === "pack"}
              disabled={settings.assets !== "pack"}
              onCheckedChange={includeRemote => update({ includeRemote })}
            />
          </div>

          <RadioGroup
            label={t("links.title")}
            value={settings.linkStyle}
            onValueChange={value => update({ linkStyle: value })}
          >
            <Radio
              value="relative"
              label={t("links.relative")}
              description={t("links.relativeHint")}
            />
            <Radio value="wiki" label={t("links.wiki")} description={t("links.wikiHint")} />
            <Radio value="text" label={t("links.text")} description={t("links.textHint")} />
          </RadioGroup>
          <p className={cn(hintClass, "-mt-2.5")}>{t("links.outsideHint")}</p>

          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-ink-1 text-tau-body">{t("frontmatter.title")}</div>
              <div className={hintClass}>{t("frontmatter.hint")}</div>
            </div>
            <Switch
              size="sm"
              aria-label={t("frontmatter.title")}
              checked={settings.frontmatter}
              onCheckedChange={frontmatter => update({ frontmatter })}
            />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{t("common.fileName")}</span>
            <Input
              value={fileName}
              placeholder={defaultFileName}
              onChange={event => setFileName(event.target.value)}
            />
          </label>
        </div>
      </div>
    </Dialog>
  );
}
