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
  SCOPE_LABEL,
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
  const [progress, setProgress] = useState<{ percent: number; label?: string } | null>(null);

  const catalog = useQuery({
    queryKey: ["markdown-export", databaseName, scope],
    queryFn: () => loadExportCatalog(scope, databaseName),
    staleTime: 0,
    gcTime: 0,
  });
  const tree = useMemo(() => catalog.data?.tree ?? [], [catalog.data]);
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
    return `${SCOPE_LABEL[scope]}-${today()}`;
  }, [scope, request.projectId, catalog.data, tree]);

  const exporting = progress !== null;
  const blockReason = catalog.isLoading
    ? "正在读取内容…"
    : catalog.error
      ? "读取内容失败"
      : exportableIds.length === 0
        ? `没有可导出的${SCOPE_LABEL[scope]}`
        : selectedCount === 0
          ? "至少勾选一篇"
          : "";

  const run = async () => {
    setProgress({ percent: 0, label: "正在打包…" });
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
        toast.info("已取消导出");
        return;
      }
      if (result.warnings.length > 0) {
        console.warn("Markdown 导出警告:", result.warnings);
        toast.warning(
          `已导出 ${result.fileCount} 篇，${result.warnings.length} 个资源未能打包，保留了原地址`
        );
      } else {
        toast.success(`已导出 ${result.fileCount} 篇 · ${result.assetCount} 个资源`);
      }
      onClose();
    } catch (error) {
      toast.error(`导出失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setProgress(null);
    }
  };

  const impact = exporting
    ? progress?.label || "正在导出…"
    : blockReason || `将导出 ${selectedCount} 篇为 Markdown 压缩包`;

  return (
    <Dialog
      title="导出为 Markdown"
      open
      onOpenChange={next => !next && onClose()}
      locked={exporting}
      width={860}
      height={620}
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
            loadingText={`导出中 ${progress?.percent ?? 0}%`}
            disabled={!!blockReason}
            onClick={() => void run()}
          >
            导出
          </Button>
        </>
      }
    >
      <div className="mt-3.5 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px]">
        <div className="border-line-1 flex min-h-0 flex-col border-r">
          <div className="flex flex-wrap items-center gap-1.5 pb-2.5 pl-6 pr-5">
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
                {SCOPE_LABEL[key]}
              </button>
            ))}
            <span className={cn(hintClass, "ml-auto tabular-nums")}>
              {selectedCount} / {exportableIds.length} 篇
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
                {selectedCount === exportableIds.length ? "全不选" : "全选"}
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-3 pl-4 pr-3">
            {catalog.isLoading ? (
              <Loading />
            ) : catalog.error ? (
              <p role="alert" className="text-danger text-tau-meta py-6 text-center">
                读取内容失败：{catalog.error instanceof Error ? catalog.error.message : "未知错误"}
              </p>
            ) : exportableIds.length === 0 ? (
              <p className={cn(hintClass, "py-16 text-center")}>没有可导出的{SCOPE_LABEL[scope]}</p>
            ) : (
              <CheckTree
                key={scope}
                nodes={tree}
                checkedKeys={checkedKeys}
                onCheckedKeysChange={keys =>
                  setCheckedByScope(prev => ({ ...prev, [scope]: keys }))
                }
                isSelectable={node => node.exportable}
                getTag={node =>
                  node.exportable && node.empty
                    ? { label: "空白", hint: "没有正文，导出空文件或只作文件夹" }
                    : null
                }
                initiallyCollapsed={collapsedIds}
              />
            )}
          </div>
          <p className="text-ink-3 text-tau-micro px-6 pb-3 pt-2">
            包内目录即左侧结构：项目按文档树，文章与卡片按首个标签分文件夹
          </p>
        </div>

        <div className="flex min-h-0 flex-col gap-[18px] overflow-y-auto pb-5 pl-[22px] pr-6">
          <RadioGroup
            label="本地资源"
            value={settings.assets}
            onValueChange={value => update({ assets: value })}
          >
            <Radio value="pack" label="打包进 assets/" description="正文改为相对路径，换机可用" />
            <Radio value="keep" label="保留原地址" description="只导出文字，图片仍指向本机或图床" />
          </RadioGroup>
          <div className="-mt-2.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "text-tau-body",
                  settings.assets === "pack" ? "text-ink-1" : "text-ink-3"
                )}
              >
                同时下载远程图片
              </div>
              <div className={hintClass}>图床地址也打包，导出更慢</div>
            </div>
            <Switch
              size="sm"
              aria-label="同时下载远程图片"
              checked={settings.includeRemote && settings.assets === "pack"}
              disabled={settings.assets !== "pack"}
              onCheckedChange={includeRemote => update({ includeRemote })}
            />
          </div>

          <RadioGroup
            label="文档互链"
            value={settings.linkStyle}
            onValueChange={value => update({ linkStyle: value })}
          >
            <Radio
              value="relative"
              label="相对 .md 链接"
              description="通用，Typora / VS Code 可跳转"
            />
            <Radio value="wiki" label="[[文件名]]" description="Obsidian / Logseq 双链" />
            <Radio value="text" label="纯文字" description="只保留标题" />
          </RadioGroup>
          <p className={cn(hintClass, "-mt-2.5")}>指向本次未导出内容的链接只保留标题</p>

          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-ink-1 text-tau-body">写入 frontmatter</div>
              <div className={hintClass}>标题、标签、创建与更新时间</div>
            </div>
            <Switch
              size="sm"
              aria-label="写入 frontmatter"
              checked={settings.frontmatter}
              onCheckedChange={frontmatter => update({ frontmatter })}
            />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>文件名</span>
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
