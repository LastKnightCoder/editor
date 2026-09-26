/**
 * Markdown 文件窗口（路由 /markdown-window?filePath= | rootPath=）：编辑磁盘上的文件 / 文件夹。
 * 主进程 windows/markdown-window.ts 负责开窗；无参数时为欢迎页。
 *
 * 一次只打开一个文件；文件视图按路径 key 重建，各自持有保存会话——切换、改名、删除、
 * 关窗前先 flush，内容不会写进别的文件。URL 的 filePath 随当前文件同步：本地图片的相对路径
 * 以它为基准解析（utils/localMediaPath）。
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BookOpen,
  ChevronRight,
  ClipboardCopy,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FileType,
  FolderInput,
  FilePlus,
  Image as ImageIcon,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  Search,
  StretchHorizontal,
  X,
} from "lucide-react";
import type { Descendant } from "slate";
import { IconButton, Menu, ToastHost, cn, initScrollbarAutoHide, toast } from "@tau/ui";
import { AuxWindowTitlebar } from "@/app/AuxWindowTitlebar";
import { ThemeToggle } from "@/app/Titlebar";
import { useThemeRuntime } from "@/app/useThemeRuntime";
import useSyncFont from "@/hooks/useSyncFont";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import {
  addRecentProject,
  closeWindow,
  saveFileWithDialog,
  selectDirectoryWithDialog,
  selectFile,
  showInFolder,
} from "@/commands";
import { on, off } from "@/electron";
import { copyWechatHtmlToClipboard, downloadMarkdown } from "@/utils";
import "@/app/base.css";
import { getFileCategory } from "./fileTypes";
import { baseName, dirName, isWithin, rebasePath, splitExtension } from "./paths";
import { useMarkdownWindowPrefs } from "./markdownWindowPrefs";
import { FileSidebar } from "./FileSidebar";
import { MarkdownFileView } from "./markdown/MarkdownFileView";
import { CodeFileView } from "./CodeFileView";
import { ExternalFileView, MediaView } from "./MediaViews";
import { NoFileView, WelcomeView } from "./WelcomeView";
import type { FileTreeHandlers } from "./fileTree/FileTree";
import type { FileViewHandle, FileViewStatus, MarkdownViewHandle } from "./types";

/** 当前视图句柄：Markdown 视图多出源码切换与导出取数 */
type ViewHandle = FileViewHandle & Partial<Omit<MarkdownViewHandle, "flush">>;

const rootClass =
  "app flex h-screen flex-col overflow-hidden bg-page font-tau text-tau-body text-ink-1 antialiased";
const MENU_ICON = "size-[15px] shrink-0";
const MARKDOWN_FILTERS = [{ name: "Markdown", extensions: ["md", "markdown"] }];
const toastAdapter = {
  success: (msg: string) => toast.success(msg),
  error: (msg: string) => toast.error(msg),
};

type ExportState = { kind: "image" | "epub" | "pdf"; content: Descendant[]; title: string } | null;

export default function MarkdownWindowPage() {
  useSyncFont();
  useThemeRuntime();
  useEffect(() => initScrollbarAutoHide(), []);

  const [searchParams, setSearchParams] = useSearchParams();
  const [initial] = useState(() => ({
    filePath: searchParams.get("filePath"),
    rootPath: searchParams.get("rootPath"),
  }));
  const [rootPath, setRootPath] = useState<string | null>(
    initial.rootPath ?? (initial.filePath ? dirName(initial.filePath) : null)
  );
  const [activePath, setActivePath] = useState<string | null>(initial.filePath);
  const prefs = useMarkdownWindowPrefs();
  // 单文件打开时侧栏先收起（Typora 式全宽写作）；文件夹模式按偏好
  const [sidebarOpen, setSidebarOpenState] = useState(initial.filePath ? false : prefs.sidebarOpen);
  const setSidebarOpen = (open: boolean) => {
    setSidebarOpenState(open);
    prefs.setSidebarOpen(open);
  };

  const viewRef = useRef<ViewHandle | null>(null);
  const setViewHandle = useCallback((handle: ViewHandle | null) => {
    viewRef.current = handle;
  }, []);
  const [status, setStatus] = useState<FileViewStatus>({ dirty: false });
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);
  const [exporting, setExporting] = useState<ExportState>(null);
  const treeApiRef = useRef<{ reveal(path: string): void } | null>(null);

  const category = activePath ? getFileCategory(activePath) : null;
  const fileTitle = activePath ? splitExtension(baseName(activePath)).stem : "";

  // URL / 窗口标题跟随当前文件
  useEffect(() => {
    const next = new URLSearchParams();
    if (activePath) next.set("filePath", activePath);
    else if (rootPath) next.set("rootPath", rootPath);
    setSearchParams(next, { replace: true });
    const parts = [activePath && baseName(activePath), rootPath && baseName(rootPath)].filter(
      Boolean
    );
    document.title = parts.join(" — ") || "Markdown";
  }, [activePath, rootPath, setSearchParams]);

  const flush = useCallback(async () => {
    await viewRef.current?.flush();
  }, []);

  const openFile = useCallback(
    async (path: string) => {
      if (path === activePath) return;
      await flush();
      setStatus({ dirty: false });
      if (!rootPath || !isWithin(path, rootPath)) setRootPath(dirName(path));
      setActivePath(path);
      treeApiRef.current?.reveal(path);
      void addRecentProject(path);
    },
    [activePath, flush, rootPath]
  );

  const openFolder = useCallback(async () => {
    const dir = await selectDirectoryWithDialog();
    if (!dir) return;
    await flush();
    setStatus({ dirty: false });
    setRootPath(dir);
    setActivePath(null);
    setSidebarOpen(true);
    void addRecentProject(dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush]);

  const openFileDialog = useCallback(async () => {
    const [path] =
      (await selectFile({ properties: ["openFile"], filters: MARKDOWN_FILTERS })) ?? [];
    if (path) void openFile(path);
  }, [openFile]);

  const saveAs = useCallback(
    async (text: string, defaultName = activePath ? baseName(activePath) : "未命名.md") => {
      const result = await saveFileWithDialog({
        defaultFileName: defaultName,
        filters: MARKDOWN_FILTERS,
        data: text,
      });
      if (!result.canceled && result.filePath) void openFile(result.filePath);
    },
    [activePath, openFile]
  );

  const newFile = useCallback(() => {
    if (rootPath) {
      setSidebarOpen(true);
      setCreating("file");
    } else {
      void saveAs("", "未命名.md");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath, saveAs]);

  const openPath = useCallback(
    async (path: string, isDirectory: boolean) => {
      if (isDirectory) {
        await flush();
        setRootPath(path);
        setActivePath(null);
        setSidebarOpen(true);
        void addRecentProject(path);
        return;
      }
      void openFile(path);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flush, openFile]
  );

  const treeHandlers: FileTreeHandlers = {
    onOpen: path => void openFile(path),
    beforeMutate: async path => {
      if (activePath && isWithin(activePath, path)) await flush();
    },
    onMoved: (from, to) => {
      if (activePath && isWithin(activePath, from)) setActivePath(rebasePath(activePath, from, to));
    },
    onRemoved: path => {
      if (activePath && isWithin(activePath, path)) {
        setActivePath(null);
        setStatus({ dirty: false });
      }
    },
  };

  // 快捷键：⌘N 新建 · ⌘O 打开文件 · ⌘⇧O 打开文件夹 · ⌘\ 侧栏
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.isComposing) return;
      const key = event.key.toLowerCase();
      if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        newFile();
      } else if (key === "o") {
        event.preventDefault();
        if (event.shiftKey) void openFolder();
        else void openFileDialog();
      } else if (event.key === "\\" && rootPath) {
        event.preventDefault();
        setSidebarOpen(!sidebarOpen);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newFile, openFileDialog, openFolder, rootPath, sidebarOpen]);

  // 关窗前落盘：有未保存改动时拦一次，保存后再关（保存失败第二次关闭直接放行）
  const closingRef = useRef(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = status.dirty;
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || closingRef.current) return;
      event.preventDefault();
      event.returnValue = false;
      closingRef.current = true;
      void flush().finally(() => void closeWindow());
    };
    const onQuitting = () => void flush();
    window.addEventListener("beforeunload", onBeforeUnload);
    on("app:quitting", onQuitting);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      off("app:quitting", onQuitting);
    };
  }, [flush]);

  const startExport = (kind: NonNullable<ExportState>["kind"]) => {
    const content = viewRef.current?.getContent?.();
    if (content) setExporting({ kind, content, title: fileTitle || "未命名文档" });
  };
  const isMarkdown = category === "markdown";

  const moreMenu = (
    <Menu
      align="end"
      fit
      trigger={
        <IconButton title="更多" aria-label="更多">
          <MoreHorizontal size={17} strokeWidth={1.75} />
        </IconButton>
      }
    >
      {isMarkdown && (
        <Menu.CheckboxItem
          icon={<Code2 className={MENU_ICON} strokeWidth={1.75} />}
          kbd="⌘/"
          checked={Boolean(status.sourceMode)}
          onCheckedChange={() => viewRef.current?.toggleSource?.()}
        >
          源码模式
        </Menu.CheckboxItem>
      )}
      {isMarkdown && (
        <Menu.CheckboxItem
          icon={<StretchHorizontal className={MENU_ICON} strokeWidth={1.75} />}
          checked={prefs.wide}
          onCheckedChange={prefs.toggleWide}
        >
          宽版心
        </Menu.CheckboxItem>
      )}
      <Menu.Item
        icon={<Search className={MENU_ICON} strokeWidth={1.75} />}
        kbd="⌘F"
        onSelect={() =>
          // 查找条（GlobalFindBar）监听全局快捷键，菜单入口复用同一事件
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true })
          )
        }
      >
        查找
      </Menu.Item>
      {isMarkdown && (
        <>
          <Menu.Separator />
          <Menu.Submenu label="复制" icon={<Copy className={MENU_ICON} strokeWidth={1.75} />}>
            <Menu.Item
              icon={<ClipboardCopy className={MENU_ICON} strokeWidth={1.75} />}
              onSelect={() =>
                void navigator.clipboard
                  .writeText(viewRef.current?.getMarkdown?.() ?? "")
                  .then(() => toast.success("已复制 Markdown"))
              }
            >
              复制 Markdown
            </Menu.Item>
            <Menu.Item
              icon={<MessageSquare className={MENU_ICON} strokeWidth={1.75} />}
              onSelect={() =>
                void copyWechatHtmlToClipboard(viewRef.current?.getContent?.() ?? [], toastAdapter)
              }
            >
              复制公众号格式
            </Menu.Item>
          </Menu.Submenu>
          <Menu.Submenu label="导出" icon={<Download className={MENU_ICON} strokeWidth={1.75} />}>
            <Menu.Item
              icon={<FileText className={MENU_ICON} strokeWidth={1.75} />}
              onSelect={() => downloadMarkdown(viewRef.current?.getMarkdown?.() ?? "", fileTitle)}
            >
              Markdown 文件
            </Menu.Item>
            <Menu.Item
              icon={<ImageIcon className={MENU_ICON} strokeWidth={1.75} />}
              onSelect={() => startExport("image")}
            >
              图片
            </Menu.Item>
            <Menu.Item
              icon={<BookOpen className={MENU_ICON} strokeWidth={1.75} />}
              onSelect={() => startExport("epub")}
            >
              EPUB
            </Menu.Item>
            <Menu.Item
              icon={<FileType className={MENU_ICON} strokeWidth={1.75} />}
              onSelect={() => startExport("pdf")}
            >
              PDF
            </Menu.Item>
          </Menu.Submenu>
        </>
      )}
      <Menu.Separator />
      {activePath && (
        <Menu.Item
          icon={<ExternalLink className={MENU_ICON} strokeWidth={1.75} />}
          onSelect={() => void showInFolder(activePath)}
        >
          在访达中显示
        </Menu.Item>
      )}
      <Menu.Item
        icon={<FilePlus className={MENU_ICON} strokeWidth={1.75} />}
        kbd="⌘N"
        onSelect={newFile}
      >
        新建文件
      </Menu.Item>
      <Menu.Item
        icon={<FileText className={MENU_ICON} strokeWidth={1.75} />}
        kbd="⌘O"
        onSelect={() => void openFileDialog()}
      >
        打开文件…
      </Menu.Item>
      <Menu.Item
        icon={<FolderInput className={MENU_ICON} strokeWidth={1.75} />}
        kbd="⌘⇧O"
        onSelect={() => void openFolder()}
      >
        打开文件夹…
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item
        icon={<X className={MENU_ICON} strokeWidth={1.75} />}
        onSelect={() => void closeWindow()}
      >
        关闭窗口
      </Menu.Item>
    </Menu>
  );

  let body: ReactNode;
  if (!rootPath && !activePath) {
    body = (
      <WelcomeView
        actions={{
          openFolder: () => void openFolder(),
          openFile: () => void openFileDialog(),
          newFile,
          openPath: (path, isDirectory) => void openPath(path, isDirectory),
        }}
      />
    );
  } else if (!activePath) {
    body = <NoFileView onNewFile={newFile} />;
  } else if (category === "markdown") {
    body = (
      <MarkdownFileView
        key={activePath}
        ref={setViewHandle}
        path={activePath}
        wide={prefs.wide}
        onStatus={setStatus}
        onOpenMarkdown={path => void openFile(path)}
        onSaveAs={text => void saveAs(text)}
      />
    );
  } else if (category === "code") {
    body = (
      <CodeFileView
        key={activePath}
        ref={setViewHandle}
        path={activePath}
        onStatus={setStatus}
        onSaveAs={text => void saveAs(text)}
      />
    );
  } else if (category === "image" || category === "video" || category === "audio") {
    body = <MediaView key={activePath} path={activePath} type={category} />;
  } else {
    body = <ExternalFileView key={activePath} path={activePath} />;
  }

  const crumbs =
    rootPath && activePath ? activePath.slice(rootPath.length).split(/[\\/]/).filter(Boolean) : [];

  return (
    <div className={rootClass}>
      <AuxWindowTitlebar
        leading={
          <>
            {rootPath && (
              <IconButton
                className={cn(
                  "app-region-no-drag",
                  sidebarOpen && "bg-selected text-accent-text hover:bg-selected"
                )}
                title={sidebarOpen ? "收起侧栏 (⌘\\)" : "展开侧栏 (⌘\\)"}
                aria-label="侧栏"
                aria-pressed={sidebarOpen}
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <PanelLeft size={17} strokeWidth={1.75} />
              </IconButton>
            )}
            <nav
              aria-label="路径"
              className="text-tau-meta text-ink-3 flex min-w-0 items-center gap-1"
            >
              {[rootPath ? baseName(rootPath) : "Markdown", ...crumbs].map((part, index, parts) => {
                const last = index === parts.length - 1;
                return (
                  <span
                    key={`${index}-${part}`}
                    className={cn("flex items-center gap-1", last ? "min-w-0" : "shrink-0")}
                  >
                    {index > 0 && (
                      <ChevronRight className="size-3 shrink-0 opacity-60" strokeWidth={1.75} />
                    )}
                    <span className={cn(last && "text-ink-1 truncate font-medium")}>{part}</span>
                  </span>
                );
              })}
              {status.dirty && (
                <span className="bg-accent ml-1 size-1.5 shrink-0 rounded-full" title="未保存" />
              )}
            </nav>
          </>
        }
        actions={
          <>
            <ThemeToggle />
            {moreMenu}
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        {rootPath && sidebarOpen && (
          <FileSidebar
            rootPath={rootPath}
            activePath={activePath}
            dirtyPath={status.dirty ? activePath : null}
            outline={isMarkdown ? status.outline : undefined}
            creating={creating}
            onCreate={setCreating}
            onCreatingHandled={() => setCreating(null)}
            onOpenFolder={() => void openFolder()}
            handlers={treeHandlers}
            treeApiRef={treeApiRef}
          />
        )}
        <main
          className={cn(
            "tau-sheet bg-surface shadow-card rounded-tau-md relative mb-2 mr-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
            !(rootPath && sidebarOpen) && "ml-2"
          )}
        >
          {body}
        </main>
      </div>

      <ContentExportModal
        open={exporting?.kind === "image"}
        onClose={() => setExporting(null)}
        content={exporting?.content ?? []}
        title={exporting?.title ?? ""}
      />
      <EpubExportModal
        open={exporting?.kind === "epub"}
        onClose={() => setExporting(null)}
        content={exporting?.content ?? []}
        title={exporting?.title ?? ""}
      />
      <PdfExportModal
        visible={exporting?.kind === "pdf"}
        onClose={() => setExporting(null)}
        content={exporting?.content ?? []}
        title={exporting?.title ?? ""}
      />
      <ToastHost />
    </div>
  );
}
