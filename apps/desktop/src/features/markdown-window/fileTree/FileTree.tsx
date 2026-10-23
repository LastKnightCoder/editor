import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import {
  ChevronRight,
  Copy,
  ExternalLink,
  File,
  FileCode,
  FilePlus,
  FileText,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  Link,
  Music,
  Pencil,
  Trash2,
} from "lucide-react";
import { ContextMenu, Menu, cn, toast } from "@tau/ui";
import {
  createDir,
  createTextFileExclusive,
  pathExists,
  renameFileOrDirectory,
  showInFolder,
  trashItem,
} from "@/commands/file";
import { revealInFileManagerLabel, trashName } from "@/platform";
import { getFileCategory } from "../fileTypes";
import { baseName, dirName, invalidFileName, isWithin, joinPath, splitExtension } from "../paths";
import type { TreeRow } from "./useFileTree";

const DRAG_TYPE = "application/x-tau-md-path";
const ICON = "size-[15px] shrink-0";
const MENU_ICON = "size-[15px] shrink-0";

type Editing =
  { mode: "create-file" | "create-folder"; dir: string } | { mode: "rename"; path: string };

export interface FileTreeHandlers {
  onOpen(path: string): void;
  /** 改动某路径前（重命名 / 移动 / 删除）：让打开中的文件先落盘 */
  beforeMutate(path: string): Promise<void>;
  onMoved(from: string, to: string): void;
  onRemoved(path: string): void;
}

function fileIcon(name: string) {
  switch (getFileCategory(name)) {
    case "markdown":
      return FileText;
    case "code":
      return FileCode;
    case "image":
      return ImageIcon;
    case "video":
      return Film;
    case "audio":
      return Music;
    default:
      return File;
  }
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * 文件树：行内新建 / 重命名（Enter 确认、Esc 取消、非法名原地提示）、右键菜单、拖拽移动、
 * 移到回收站；行上 F2 重命名（删除不设快捷键，只走右键菜单，防误删）。
 */
export function FileTree({
  rootPath,
  rows,
  activePath,
  dirtyPath,
  creating,
  onCreatingHandled,
  toggle,
  reveal,
  refreshDir,
  handlers,
}: {
  rootPath: string;
  rows: TreeRow[];
  activePath: string | null;
  dirtyPath: string | null;
  /** 侧栏头部按钮发起的新建（建在根目录） */
  creating: "file" | "folder" | null;
  onCreatingHandled(): void;
  toggle(dir: string, open?: boolean): void;
  reveal(path: string): void;
  refreshDir(dir: string): Promise<void>;
  handlers: FileTreeHandlers;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    if (!creating) return;
    setEditing({ mode: creating === "file" ? "create-file" : "create-folder", dir: rootPath });
    onCreatingHandled();
  }, [creating, onCreatingHandled, rootPath]);

  const startCreate = (mode: "create-file" | "create-folder", dir: string) => {
    if (dir !== rootPath) toggle(dir, true);
    setEditing({ mode, dir });
  };

  /** 提交行内输入；返回错误文案（留在输入态）或 null（完成） */
  const commit = async (value: string): Promise<string | null> => {
    if (!editing) return null;
    const name = value.trim();
    const invalid = invalidFileName(name);
    if (invalid) return invalid;
    try {
      if (editing.mode === "rename") {
        const from = editing.path;
        if (name === baseName(from)) return null;
        const to = joinPath(dirName(from), name);
        if (await pathExists(to)) return "已存在同名文件或文件夹";
        await handlers.beforeMutate(from);
        await renameFileOrDirectory(from, to);
        handlers.onMoved(from, to);
        await refreshDir(dirName(from));
        return null;
      }
      const fileName =
        editing.mode === "create-file" && !splitExtension(name).ext ? `${name}.md` : name;
      const target = joinPath(editing.dir, fileName);
      if (await pathExists(target)) return "已存在同名文件或文件夹";
      if (editing.mode === "create-file") await createTextFileExclusive(target, "");
      else await createDir(target);
      await refreshDir(editing.dir);
      if (editing.mode === "create-file") {
        reveal(target);
        handlers.onOpen(target);
      } else {
        toggle(target, true);
      }
      return null;
    } catch (error) {
      return errorText(error);
    }
  };

  const trash = async (path: string) => {
    try {
      await handlers.beforeMutate(path);
      await trashItem(path);
      handlers.onRemoved(path);
      await refreshDir(dirName(path));
      toast.success(`已将「${baseName(path)}」移到${trashName}`);
    } catch (error) {
      toast.error(`删除失败：${errorText(error)}`);
    }
  };

  const move = async (from: string, targetDir: string) => {
    const to = joinPath(targetDir, baseName(from));
    try {
      if (await pathExists(to)) {
        toast.error(`「${baseName(targetDir)}」中已有同名项目`);
        return;
      }
      await handlers.beforeMutate(from);
      await renameFileOrDirectory(from, to);
      handlers.onMoved(from, to);
      await Promise.all([refreshDir(dirName(from)), refreshDir(targetDir)]);
      if (targetDir !== rootPath) toggle(targetDir, true);
    } catch (error) {
      toast.error(`移动失败：${errorText(error)}`);
    }
  };

  const canDrop = (target: string) =>
    Boolean(dragging) &&
    dragging !== target &&
    !isWithin(target, dragging!) &&
    dirName(dragging!) !== target;

  const dropHandlers = (target: string) => ({
    onDragOver: (event: DragEvent) => {
      if (!canDrop(target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDropTarget(target);
    },
    onDragLeave: (event: DragEvent) => {
      event.stopPropagation();
      setDropTarget(current => (current === target ? null : current));
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const from = event.dataTransfer.getData(DRAG_TYPE);
      setDropTarget(null);
      setDragging(null);
      if (from && canDrop(target)) void move(from, target);
    },
  });

  const copyText = (text: string, label: string) =>
    void navigator.clipboard.writeText(text).then(() => toast.success(`已复制${label}`));

  const menuFor = (row: TreeRow) => {
    const dir = row.isDirectory ? row.path : dirName(row.path);
    const relative = row.path.slice(rootPath.length).replace(/^[\\/]/, "");
    return (
      <>
        <Menu.Item
          icon={<FilePlus className={MENU_ICON} strokeWidth={1.75} />}
          onSelect={() => startCreate("create-file", dir)}
        >
          新建文件
        </Menu.Item>
        <Menu.Item
          icon={<FolderPlus className={MENU_ICON} strokeWidth={1.75} />}
          onSelect={() => startCreate("create-folder", dir)}
        >
          新建文件夹
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item
          icon={<Pencil className={MENU_ICON} strokeWidth={1.75} />}
          kbd="F2"
          onSelect={() => setEditing({ mode: "rename", path: row.path })}
        >
          重命名
        </Menu.Item>
        <Menu.Item
          icon={<Copy className={MENU_ICON} strokeWidth={1.75} />}
          onSelect={() => copyText(row.path, "路径")}
        >
          复制路径
        </Menu.Item>
        <Menu.Item
          icon={<Link className={MENU_ICON} strokeWidth={1.75} />}
          onSelect={() => copyText(relative, "相对路径")}
        >
          复制相对路径
        </Menu.Item>
        <Menu.Item
          icon={<ExternalLink className={MENU_ICON} strokeWidth={1.75} />}
          onSelect={() => void showInFolder(row.path)}
        >
          {revealInFileManagerLabel}
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item
          danger
          icon={<Trash2 className={MENU_ICON} strokeWidth={1.75} />}
          onSelect={() => void trash(row.path)}
        >
          移到{trashName}
        </Menu.Item>
      </>
    );
  };

  const onRowKeyDown = (event: KeyboardEvent, row: TreeRow) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (row.isDirectory) toggle(row.path);
      else handlers.onOpen(row.path);
    } else if (event.key === "F2") {
      event.preventDefault();
      setEditing({ mode: "rename", path: row.path });
    }
  };

  const indent = (depth: number) => ({ paddingLeft: 8 + depth * 16 });

  const creatingRow = (dir: string, depth: number) =>
    editing && editing.mode !== "rename" && editing.dir === dir ? (
      <div className="flex h-[30px] items-center gap-[6px] pr-2" style={indent(depth)}>
        <span className="w-3 shrink-0" />
        {editing.mode === "create-file" ? (
          <FileText className={cn(ICON, "text-ink-3")} strokeWidth={1.75} />
        ) : (
          <Folder className={cn(ICON, "text-ink-3")} strokeWidth={1.75} />
        )}
        <NameInput
          initial={editing.mode === "create-file" ? "未命名.md" : "新建文件夹"}
          onCommit={commit}
          onCancel={() => setEditing(null)}
          onDone={() => setEditing(null)}
        />
      </div>
    ) : null;

  return (
    <div
      className="text-tau-body min-h-full pb-6"
      {...dropHandlers(rootPath)}
      onDragEnd={() => {
        setDragging(null);
        setDropTarget(null);
      }}
    >
      {creatingRow(rootPath, 0)}
      {rows.map(row => {
        const Icon = row.isDirectory ? (row.expanded ? FolderOpen : Folder) : fileIcon(row.name);
        const renaming = editing?.mode === "rename" && editing.path === row.path;
        const active = row.path === activePath;
        return (
          <div key={row.path}>
            <ContextMenu content={menuFor(row)}>
              <div
                role="treeitem"
                tabIndex={0}
                aria-selected={active}
                aria-expanded={row.isDirectory ? row.expanded : undefined}
                draggable={!renaming}
                onDragStart={event => {
                  event.dataTransfer.setData(DRAG_TYPE, row.path);
                  event.dataTransfer.effectAllowed = "move";
                  setDragging(row.path);
                }}
                {...(row.isDirectory ? dropHandlers(row.path) : {})}
                onClick={() => (row.isDirectory ? toggle(row.path) : handlers.onOpen(row.path))}
                onKeyDown={event => onRowKeyDown(event, row)}
                style={indent(row.depth)}
                title={row.path}
                className={cn(
                  "rounded-tau-sm flex h-[30px] w-full cursor-default items-center gap-[6px] pr-2 text-left transition-colors",
                  row.isDirectory ? "text-ink-1" : "text-ink-2",
                  active
                    ? "bg-selected text-accent-text font-medium"
                    : "hover:bg-hover hover:text-ink-1",
                  dropTarget === row.path &&
                    "bg-accent-soft outline-accent outline-dashed outline-[1.5px] -outline-offset-[1.5px]",
                  dragging === row.path && "opacity-45"
                )}
              >
                {row.isDirectory ? (
                  <ChevronRight
                    className={cn(
                      "text-ink-3 size-3 shrink-0 transition-transform",
                      row.expanded && "rotate-90"
                    )}
                    strokeWidth={2}
                  />
                ) : (
                  <span className="w-3 shrink-0" />
                )}
                <Icon className={ICON} strokeWidth={1.75} />
                {renaming ? (
                  <NameInput
                    initial={row.name}
                    selectStem={!row.isDirectory}
                    onCommit={commit}
                    onCancel={() => setEditing(null)}
                    onDone={() => setEditing(null)}
                  />
                ) : (
                  <span className="truncate">{row.name}</span>
                )}
                {row.path === dirtyPath && !renaming && (
                  <span
                    className="bg-accent ml-auto size-1.5 shrink-0 rounded-full"
                    title="未保存"
                  />
                )}
              </div>
            </ContextMenu>
            {row.isDirectory && row.expanded && creatingRow(row.path, row.depth + 1)}
          </div>
        );
      })}
    </div>
  );
}

/** 行内名称输入：挂载即聚焦（重命名文件只选中主名）；Enter 提交、Esc 取消、失焦提交 */
function NameInput({
  initial,
  selectStem,
  onCommit,
  onCancel,
  onDone,
}: {
  initial: string;
  selectStem?: boolean;
  onCommit(value: string): Promise<string | null>;
  onCancel(): void;
  onDone(): void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(0, selectStem ? splitExtension(initial).stem.length : initial.length);
  }, [initial, selectStem]);

  const submit = async () => {
    if (busy.current) return;
    busy.current = true;
    const failure = await onCommit(value);
    busy.current = false;
    if (failure) {
      setError(failure);
      ref.current?.focus();
    } else {
      onDone();
    }
  };

  return (
    <input
      ref={ref}
      value={value}
      title={error ?? undefined}
      aria-invalid={Boolean(error)}
      onClick={event => event.stopPropagation()}
      onChange={event => {
        setValue(event.target.value);
        setError(null);
      }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") void submit();
        else if (event.key === "Escape") onCancel();
      }}
      onBlur={() => {
        if (value === initial) onCancel();
        else void submit();
      }}
      className={cn(
        "bg-surface text-ink-1 h-[24px] min-w-0 flex-1 rounded-[5px] border px-1.5 outline-none",
        error ? "border-danger" : "border-accent"
      )}
    />
  );
}
