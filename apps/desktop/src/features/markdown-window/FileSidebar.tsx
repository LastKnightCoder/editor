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
import { IconButton, Menu, ResizeHandle } from "@tau/ui";
import { FadeScroll } from "@tau/ui";
import { showInFolder } from "@/commands";
import { revealInFileManagerLabel } from "@/platform";
import { baseName } from "./paths";
import { FileTree, type FileTreeHandlers } from "./fileTree/FileTree";
import { FILTER_ROW_LIMIT, useFileTree } from "./fileTree/useFileTree";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useMarkdownWindowPrefs,
} from "./markdownWindowPrefs";

const MENU_ICON = "size-[15px] shrink-0";

/** 左侧栏（落在 page 底上）：文件夹头 · 筛选 · 文件树；右缘 ResizeHandle 拖宽，双击回默认 */
export function FileSidebar({
  rootPath,
  activePath,
  dirtyPath,
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
  creating: "file" | "folder" | null;
  onCreate(kind: "file" | "folder"): void;
  onCreatingHandled(): void;
  onOpenFolder(): void;
  handlers: FileTreeHandlers;
  /** 页面借此在打开文件时展开到该文件 */
  treeApiRef: React.MutableRefObject<{ reveal(path: string): void } | null>;
}) {
  const showAll = useMarkdownWindowPrefs(s => s.showAllFiles);
  const toggleShowAll = useMarkdownWindowPrefs(s => s.toggleShowAllFiles);
  const sidebarWidth = useMarkdownWindowPrefs(s => s.sidebarWidth);
  const setSidebarWidth = useMarkdownWindowPrefs(s => s.setSidebarWidth);
  const [query, setQuery] = useState("");
  const tree = useFileTree(rootPath, query);
  treeApiRef.current = { reveal: tree.reveal };

  const create = useCallback(
    (kind: "file" | "folder") => {
      setQuery("");
      onCreate(kind);
    },
    [onCreate]
  );

  return (
    <aside
      className="relative flex shrink-0 flex-col pb-2 pl-2.5 pr-1.5"
      style={{ width: sidebarWidth }}
    >
      <div className="text-tau-body text-ink-1 flex h-9 items-center gap-1.5 pl-2 font-semibold">
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
            {revealInFileManagerLabel}
          </Menu.Item>
          <Menu.Item
            icon={<FolderInput className={MENU_ICON} strokeWidth={1.75} />}
            onSelect={onOpenFolder}
          >
            打开其它文件夹…
          </Menu.Item>
        </Menu>
      </div>

      <label className="border-line-1 bg-surface text-tau-meta text-ink-3 focus-within:border-accent rounded-tau-sm mx-1 mb-1.5 flex h-[30px] items-center gap-1.5 border px-2 transition-colors">
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

      <FadeScroll className="min-h-0 flex-1 pl-1">
        {tree.rows.length === 0 && (
          <p className="text-tau-meta text-ink-3 px-2 py-3">
            {tree.loading ? "加载中…" : query ? "没有匹配的文件" : "文件夹是空的"}
          </p>
        )}
        {tree.truncated && (
          <p className="text-tau-meta text-ink-3 px-2 pb-1">
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
      </FadeScroll>

      <ResizeHandle
        value={sidebarWidth}
        min={SIDEBAR_MIN_WIDTH}
        max={SIDEBAR_MAX_WIDTH}
        onChange={setSidebarWidth}
        side="left"
        label="侧栏宽度"
        defaultValue={SIDEBAR_DEFAULT_WIDTH}
        className="absolute -right-1 bottom-0 top-0"
      />
    </aside>
  );
}
