import { useCallback, useState } from "react";
import {
  ExternalLink,
  Eye,
  FilePlus,
  FolderInput,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { IconButton, Menu, cn } from "@tau/ui";
import { ContentOutline } from "@/components/ContentOutline";
import { FadeScroll } from "@tau/ui";
import { showInFolder } from "@/commands";
import { baseName } from "./paths";
import { FileTree, type FileTreeHandlers } from "./fileTree/FileTree";
import { FILTER_ROW_LIMIT, useFileTree } from "./fileTree/useFileTree";
import { useMarkdownWindowPrefs } from "./markdownWindowPrefs";
import type { FileViewStatus } from "./types";

const MENU_ICON = "size-[15px] shrink-0";

/** 左侧栏（落在 page 底上）：文件夹头 · 文件 / 大纲页签 · 筛选 · 文件树或大纲 */
export function FileSidebar({
  rootPath,
  activePath,
  dirtyPath,
  outline,
  creating,
  onCreate,
  onCreatingHandled,
  onOpenFolder,
  handlers,
  treeApiRef,
}: {
  rootPath: string;
  activePath: string | null;
  dirtyPath: string | null;
  outline: FileViewStatus["outline"];
  creating: "file" | "folder" | null;
  onCreate(kind: "file" | "folder"): void;
  onCreatingHandled(): void;
  onOpenFolder(): void;
  handlers: FileTreeHandlers;
  /** 页面借此在打开文件时展开到该文件 */
  treeApiRef: React.MutableRefObject<{ reveal(path: string): void } | null>;
}) {
  const tab = useMarkdownWindowPrefs(s => s.sidebarTab);
  const setTab = useMarkdownWindowPrefs(s => s.setSidebarTab);
  const showAll = useMarkdownWindowPrefs(s => s.showAllFiles);
  const toggleShowAll = useMarkdownWindowPrefs(s => s.toggleShowAllFiles);
  const [query, setQuery] = useState("");
  const tree = useFileTree(rootPath, query);
  treeApiRef.current = { reveal: tree.reveal };

  const create = useCallback(
    (kind: "file" | "folder") => {
      setTab("files");
      setQuery("");
      onCreate(kind);
    },
    [onCreate, setTab]
  );

  return (
    <aside className="flex w-[248px] shrink-0 flex-col pb-2 pl-2.5 pr-1.5">
      <div className="text-tau-meta text-ink-1 flex h-8 items-center gap-1.5 pl-2 font-semibold">
        <FolderOpen className="text-accent-text size-3.5 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate" title={rootPath}>
          {baseName(rootPath)}
        </span>
        <IconButton className="size-6" title="新建文件 (⌘N)" onClick={() => create("file")}>
          <FilePlus size={14} strokeWidth={1.75} />
        </IconButton>
        <IconButton className="size-6" title="新建文件夹" onClick={() => create("folder")}>
          <FolderPlus size={14} strokeWidth={1.75} />
        </IconButton>
        <Menu
          align="end"
          trigger={
            <IconButton className="size-6" title="更多" aria-label="更多">
              <MoreHorizontal size={14} strokeWidth={1.75} />
            </IconButton>
          }
        >
          <Menu.Item
            icon={<RefreshCw className={MENU_ICON} strokeWidth={1.75} />}
            onSelect={() => void tree.reload()}
          >
            刷新
          </Menu.Item>
          <Menu.CheckboxItem
            icon={<Eye className={MENU_ICON} strokeWidth={1.75} />}
            checked={showAll}
            onCheckedChange={toggleShowAll}
          >
            显示所有文件
          </Menu.CheckboxItem>
          <Menu.Separator />
          <Menu.Item
            icon={<ExternalLink className={MENU_ICON} strokeWidth={1.75} />}
            onSelect={() => void showInFolder(rootPath)}
          >
            在访达中显示
          </Menu.Item>
          <Menu.Item
            icon={<FolderInput className={MENU_ICON} strokeWidth={1.75} />}
            onSelect={onOpenFolder}
          >
            打开其它文件夹…
          </Menu.Item>
        </Menu>
      </div>

      <div className="bg-hover mx-1 my-1.5 flex gap-0.5 rounded-[8px] p-0.5" role="tablist">
        {(["files", "outline"] as const).map(key => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "text-tau-micro h-[22px] flex-1 rounded-[6px] transition-colors",
              tab === key
                ? "bg-surface text-ink-1 shadow-card font-medium"
                : "text-ink-2 hover:text-ink-1"
            )}
          >
            {key === "files" ? "文件" : "大纲"}
          </button>
        ))}
      </div>

      {tab === "files" && (
        <label className="border-line-1 bg-surface text-tau-micro text-ink-3 focus-within:border-accent mx-1 mb-1.5 flex h-[26px] items-center gap-1.5 rounded-[7px] border px-2 transition-colors">
          <Search className="size-3 shrink-0" strokeWidth={1.75} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => event.key === "Escape" && setQuery("")}
            placeholder="筛选文件 / 文件夹…"
            className="text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="清除筛选">
              <X className="size-3" strokeWidth={1.75} />
            </button>
          )}
        </label>
      )}

      <FadeScroll className="min-h-0 flex-1 pl-1">
        {tab === "files" ? (
          <>
            {tree.rows.length === 0 && (
              <p className="text-tau-micro text-ink-3 px-2 py-3">
                {tree.loading ? "加载中…" : query ? "没有匹配的文件" : "文件夹是空的"}
              </p>
            )}
            {tree.truncated && (
              <p className="text-tau-micro text-ink-3 px-2 pb-1">
                结果过多，仅显示前 {FILTER_ROW_LIMIT} 行，请输入更具体的关键词
              </p>
            )}
            <FileTree
              rootPath={rootPath}
              rows={tree.rows}
              activePath={activePath}
              dirtyPath={dirtyPath}
              creating={creating}
              onCreatingHandled={onCreatingHandled}
              toggle={tree.toggle}
              reveal={tree.reveal}
              refreshDir={tree.refreshDir}
              handlers={handlers}
            />
          </>
        ) : outline && outline.headers.length > 0 ? (
          <ContentOutline
            headers={outline.headers}
            scrollEl={outline.scrollEl}
            resolveAnchor={outline.resolveAnchor}
            showTitle={false}
            className="w-full"
          />
        ) : (
          <p className="text-tau-micro text-ink-3 px-2 py-3">当前文档没有标题</p>
        )}
      </FadeScroll>
    </aside>
  );
}
