/** PDF 列表条目：封面格、「最近打开」续读卡、列表排布（行式，点列头排序），以及共用的操作菜单 */

import type { ReactNode } from "react";
import {
  ArrowDown,
  BookOpen,
  CloudUpload,
  FolderOpen,
  FolderSearch,
  Link2,
  MoreHorizontal,
  PencilLine,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { IconButton, Menu, cn } from "@tau/ui";
import { INDEX_LABEL, formatDay, type PdfEntry, type PdfIndexState, type PdfSort } from "../model";
import { PdfCover } from "./PdfCover";

export interface PdfItemActions {
  onOpen(entry: PdfEntry): void;
  onRename(entry: PdfEntry): void;
  onUpload(entry: PdfEntry): void;
  onCopyLink(entry: PdfEntry): void;
  onReveal(entry: PdfEntry): void;
  onBuildIndex(entry: PdfEntry): void;
  onRelocate(entry: PdfEntry): void;
  onDelete(entry: PdfEntry): void;
}

function MenuIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="size-[15px] shrink-0" strokeWidth={1.75} />;
}

/** 菜单项按渲染函数直接返回 Menu 子项（组件库按声明树解析键盘导航） */
function menuItems(entry: PdfEntry, actions: PdfItemActions) {
  return (
    <>
      {entry.fileMissing ? (
        <Menu.Item
          icon={<MenuIcon icon={FolderSearch} />}
          onSelect={() => actions.onRelocate(entry)}
        >
          重新定位文件
        </Menu.Item>
      ) : (
        <Menu.Item icon={<MenuIcon icon={BookOpen} />} onSelect={() => actions.onOpen(entry)}>
          打开
        </Menu.Item>
      )}
      <Menu.Item icon={<MenuIcon icon={PencilLine} />} onSelect={() => actions.onRename(entry)}>
        重命名
      </Menu.Item>
      {entry.isLocal && !entry.fileMissing && (
        <>
          <Menu.Item
            icon={<MenuIcon icon={CloudUpload} />}
            onSelect={() => actions.onUpload(entry)}
          >
            上传到云端
          </Menu.Item>
          <Menu.Item icon={<MenuIcon icon={FolderOpen} />} onSelect={() => actions.onReveal(entry)}>
            在文件夹中显示
          </Menu.Item>
        </>
      )}
      {!entry.isLocal && (
        <Menu.Item icon={<MenuIcon icon={Link2} />} onSelect={() => actions.onCopyLink(entry)}>
          复制链接
        </Menu.Item>
      )}
      {(entry.index === "none" || entry.index === "failed") && !entry.fileMissing && (
        <Menu.Item icon={<MenuIcon icon={Sparkles} />} onSelect={() => actions.onBuildIndex(entry)}>
          {entry.index === "failed" ? "重建 AI 索引" : "建立 AI 索引"}
        </Menu.Item>
      )}
      <Menu.Separator />
      <Menu.Item danger icon={<MenuIcon icon={Trash2} />} onSelect={() => actions.onDelete(entry)}>
        删除
      </Menu.Item>
    </>
  );
}

function MoreMenu({
  entry,
  actions,
  className,
}: {
  entry: PdfEntry;
  actions: PdfItemActions;
  className?: string;
}) {
  return (
    <div className={className} onClick={e => e.stopPropagation()}>
      <Menu
        align="end"
        trigger={
          <IconButton
            title="更多操作"
            className="bg-surface shadow-lift enabled:hover:bg-surface-hover size-[26px] rounded-[8px]"
          >
            <MoreHorizontal className="size-[14px]" strokeWidth={1.75} />
          </IconButton>
        }
      >
        {menuItems(entry, actions)}
      </Menu>
    </div>
  );
}

/** 点击：文件丢失时改为重新定位 */
const activate = (entry: PdfEntry, actions: PdfItemActions) =>
  entry.fileMissing ? actions.onRelocate(entry) : actions.onOpen(entry);

/** 条目信息行：页数 · 标注数（都没有时给添加日期），文件丢失时给出提示 */
export function Meta({ entry }: { entry: PdfEntry }) {
  if (entry.fileMissing) return <span className="text-danger">文件丢失 · 点击重新定位</span>;
  return (
    <>
      {entry.pageCount ? <span>{entry.pageCount} 页</span> : null}
      {entry.annotationCount > 0 && <span>{entry.annotationCount} 标注</span>}
      {!entry.pageCount && entry.annotationCount === 0 && (
        <span>{formatDay(entry.addedAt)} 添加</span>
      )}
    </>
  );
}

export function CoverTile({ entry, actions }: { entry: PdfEntry; actions: PdfItemActions }) {
  return (
    <article
      tabIndex={0}
      onClick={() => activate(entry, actions)}
      onKeyDown={e => {
        if (e.key === "Enter" && e.target === e.currentTarget) activate(entry, actions);
      }}
      className="group relative min-w-0 cursor-pointer outline-none"
    >
      <PdfCover
        entry={entry}
        className="ease-tau-out group-hover:shadow-lift w-full transition-shadow duration-150 group-focus-visible:shadow-[var(--tau-focus-ring)]"
      />
      <MoreMenu
        entry={entry}
        actions={actions}
        className="ease-tau-out absolute right-2 top-2 z-[1] opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 has-[[aria-expanded=true]]:opacity-100"
      />
      {/* 标题固定占两行高：同一行的文件无论标题一行还是两行，下面的信息行都对齐 */}
      <span
        title={entry.title}
        className="mt-2.5 line-clamp-2 h-[2.8em] text-[13px] font-medium leading-[1.4] [overflow-wrap:anywhere]"
      >
        {entry.title}
      </span>
      <span className="text-tau-micro text-ink-3 mt-1 flex gap-2 tabular-nums">
        <Meta entry={entry} />
      </span>
    </article>
  );
}

export function RecentCard({ entry, onOpen }: { entry: PdfEntry; onOpen(): void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hover:bg-hover ease-tau-out flex min-w-0 gap-3.5 rounded-[var(--tau-radius-lg)] p-3.5 text-left outline-none transition-colors duration-150 focus-visible:shadow-[var(--tau-focus-ring)]"
    >
      <PdfCover entry={entry} bare className="w-[56px] self-start" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
        <span className="truncate text-[14px] font-semibold">{entry.title}</span>
        <span className="text-tau-sm text-ink-3 truncate tabular-nums">
          {formatDay(entry.openedAt)} 打开
          {entry.annotationCount > 0 && ` · ${entry.annotationCount} 条标注`}
        </span>
        {entry.lastPage && entry.pageCount ? (
          <span className="text-tau-micro text-ink-3 mt-auto flex items-center gap-2 tabular-nums">
            <span className="bg-line-1 h-[3px] flex-1 overflow-hidden rounded-full">
              <span
                className="bg-accent block h-full rounded-full"
                style={{ width: `${Math.min(100, (entry.lastPage / entry.pageCount) * 100)}%` }}
              />
            </span>
            {entry.lastPage} / {entry.pageCount} 页
          </span>
        ) : entry.lastPage ? (
          <span className="text-tau-micro text-ink-3 mt-auto tabular-nums">
            读到第 {entry.lastPage} 页
          </span>
        ) : null}
      </span>
    </button>
  );
}

const LIST_COLS =
  "grid grid-cols-[minmax(240px,2.6fr)_64px_72px_80px_96px_minmax(84px,1fr)_28px] items-center gap-4";

const INDEX_DOT: Record<PdfIndexState, string> = {
  ready: "bg-ok",
  building: "bg-accent animate-pulse",
  failed: "bg-danger",
  none: "bg-ink-3",
};

export function PdfList({
  entries,
  sort,
  onSort,
  actions,
}: {
  entries: PdfEntry[];
  sort: PdfSort;
  onSort(sort: PdfSort): void;
  actions: PdfItemActions;
}) {
  const head = (key: PdfSort, label: string) => (
    <button
      type="button"
      onClick={() => onSort(key)}
      className={cn(
        "hover:text-ink-1 inline-flex items-center gap-0.5 text-left",
        sort === key && "text-ink-1 font-medium"
      )}
    >
      {label}
      {sort === key && <ArrowDown className="size-3" strokeWidth={2} />}
    </button>
  );
  return (
    <div className="-mx-3">
      <div className={cn(LIST_COLS, "text-tau-sm text-ink-3 px-3 py-2")}>
        {head("name", "名称")}
        <span>页数</span>
        {head("annotations", "标注")}
        <span>来源</span>
        <span>AI 检索</span>
        {head("opened", "最近打开")}
        <span />
      </div>
      {entries.map(entry => (
        <Row key={entry.id} entry={entry} actions={actions} />
      ))}
    </div>
  );
}

function Row({ entry, actions }: { entry: PdfEntry; actions: PdfItemActions }) {
  const cell = (children: ReactNode) => (
    <span className="text-tau-sm text-ink-2 truncate tabular-nums">{children}</span>
  );
  return (
    <div
      tabIndex={0}
      onClick={() => activate(entry, actions)}
      onKeyDown={e => {
        if (e.key === "Enter" && e.target === e.currentTarget) activate(entry, actions);
      }}
      className={cn(
        LIST_COLS,
        "hover:bg-hover group w-full cursor-pointer rounded-[var(--tau-radius-md)] px-3 py-2 outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <PdfCover entry={entry} bare className="w-[28px] rounded-[2px]" />
        <span className="min-w-0 truncate font-medium">{entry.title}</span>
        {entry.fileMissing && <span className="text-tau-sm text-danger shrink-0">文件丢失</span>}
      </span>
      {cell(entry.pageCount ?? "—")}
      {cell(entry.annotationCount || "—")}
      {cell(entry.isLocal ? "本地" : "远程")}
      <span className="text-tau-sm text-ink-2 inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className={cn("size-1.5 rounded-full", INDEX_DOT[entry.index])} />
        {INDEX_LABEL[entry.index]}
      </span>
      {cell(formatDay(entry.openedAt))}
      <MoreMenu
        entry={entry}
        actions={actions}
        className="ease-tau-out opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 has-[[aria-expanded=true]]:opacity-100"
      />
    </div>
  );
}
