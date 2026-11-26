/** PDF 列表条目：封面格、「最近打开」续读卡、列表排布（行式，点列头排序），以及共用的操作菜单 */

import { pdfText, pdfValue, pdfFormat, pdfFileTitle, usePdfI18n } from "../i18n";
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
import { type PdfEntry, type PdfIndexState, type PdfSort } from "../model";
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
  usePdfI18n();

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
          {pdfText("file.relocate")}
        </Menu.Item>
      ) : (
        <Menu.Item icon={<MenuIcon icon={BookOpen} />} onSelect={() => actions.onOpen(entry)}>
          {pdfText("action.open")}
        </Menu.Item>
      )}
      <Menu.Item icon={<MenuIcon icon={PencilLine} />} onSelect={() => actions.onRename(entry)}>
        {pdfText("action.rename")}
      </Menu.Item>
      {entry.isLocal && !entry.fileMissing && (
        <>
          <Menu.Item
            icon={<MenuIcon icon={CloudUpload} />}
            onSelect={() => actions.onUpload(entry)}
          >
            {pdfText("file.upload")}
          </Menu.Item>
          <Menu.Item icon={<MenuIcon icon={FolderOpen} />} onSelect={() => actions.onReveal(entry)}>
            {pdfText("file.reveal")}
          </Menu.Item>
        </>
      )}
      {!entry.isLocal && (
        <Menu.Item icon={<MenuIcon icon={Link2} />} onSelect={() => actions.onCopyLink(entry)}>
          {pdfText("file.copyLink")}
        </Menu.Item>
      )}
      {(entry.index === "none" || entry.index === "failed") && !entry.fileMissing && (
        <Menu.Item icon={<MenuIcon icon={Sparkles} />} onSelect={() => actions.onBuildIndex(entry)}>
          {entry.index === "failed" ? pdfText("index.rebuild") : pdfText("index.build")}
        </Menu.Item>
      )}
      <Menu.Separator />
      <Menu.Item danger icon={<MenuIcon icon={Trash2} />} onSelect={() => actions.onDelete(entry)}>
        {pdfText("action.delete")}
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
  usePdfI18n();

  return (
    <div className={className} onClick={e => e.stopPropagation()}>
      <Menu
        align="end"
        trigger={
          <IconButton
            title={pdfText("action.moreActions")}
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
  usePdfI18n();

  if (entry.fileMissing)
    return <span className="text-danger">{pdfText("file.missingAction")}</span>;
  return (
    <>
      {entry.pageCount ? (
        <span>{pdfText("file.pages", { count: pdfValue(entry.pageCount) })}</span>
      ) : null}
      {entry.annotationCount > 0 && (
        <span>{pdfText("file.annotations", { count: pdfValue(entry.annotationCount) })}</span>
      )}
      {!entry.pageCount && entry.annotationCount === 0 && (
        <span>{pdfText("file.addedAt", { date: pdfFormat.day(entry.addedAt) })}</span>
      )}
    </>
  );
}

export function CoverTile({ entry, actions }: { entry: PdfEntry; actions: PdfItemActions }) {
  usePdfI18n();

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
        className="ease-tau-out absolute top-2 right-2 z-[1] opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100"
      />
      {/* 标题固定占两行高：同一行的文件无论标题一行还是两行，下面的信息行都对齐 */}
      <span
        title={pdfFileTitle(entry.raw.fileName)}
        className="mt-2.5 line-clamp-2 h-[2.8em] text-[13px] leading-[1.4] font-medium [overflow-wrap:anywhere]"
      >
        {pdfFileTitle(entry.raw.fileName)}
      </span>
      <span className="text-tau-micro text-ink-3 mt-1 flex gap-2 tabular-nums">
        <Meta entry={entry} />
      </span>
    </article>
  );
}

export function RecentCard({ entry, onOpen }: { entry: PdfEntry; onOpen(): void }) {
  usePdfI18n();

  return (
    <button
      type="button"
      onClick={onOpen}
      className="hover:bg-hover ease-tau-out flex min-w-0 gap-3.5 rounded-[var(--tau-radius-lg)] p-3.5 text-left transition-colors duration-150 outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
    >
      <PdfCover entry={entry} bare className="w-[56px] self-start" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
        <span className="truncate text-[14px] font-semibold">
          {pdfFileTitle(entry.raw.fileName)}
        </span>
        <span className="text-tau-sm text-ink-3 truncate tabular-nums">
          {pdfText("file.openedAt", { date: pdfFormat.day(entry.openedAt) })}
          {entry.annotationCount > 0 &&
            pdfText("annotation.countSuffix", { count: pdfValue(entry.annotationCount) })}
        </span>
        {entry.lastPage && entry.pageCount ? (
          <span className="text-tau-micro text-ink-3 mt-auto flex items-center gap-2 tabular-nums">
            <span className="bg-line-1 h-[3px] flex-1 overflow-hidden rounded-full">
              <span
                className="bg-accent block h-full rounded-full"
                style={{ width: `${Math.min(100, (entry.lastPage / entry.pageCount) * 100)}%` }}
              />
            </span>
            {entry.lastPage} / {pdfText("file.pages", { count: pdfValue(entry.pageCount) })}
          </span>
        ) : entry.lastPage ? (
          <span className="text-tau-micro text-ink-3 mt-auto tabular-nums">
            {pdfText("reading.lastPage", { page: pdfValue(entry.lastPage) })}
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
  usePdfI18n();

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
        {head("name", pdfText("field.name"))}
        <span>{pdfText("field.pages")}</span>
        {head("annotations", pdfText("field.annotations"))}
        <span>{pdfText("field.source")}</span>
        <span>{pdfText("field.aiSearch")}</span>
        {head("opened", pdfText("sort.opened"))}
        <span />
      </div>
      {entries.map(entry => (
        <Row key={entry.id} entry={entry} actions={actions} />
      ))}
    </div>
  );
}

function Row({ entry, actions }: { entry: PdfEntry; actions: PdfItemActions }) {
  usePdfI18n();

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
        <span className="min-w-0 truncate font-medium">{pdfFileTitle(entry.raw.fileName)}</span>
        {entry.fileMissing && (
          <span className="text-tau-sm text-danger shrink-0">{pdfText("file.missing")}</span>
        )}
      </span>
      {cell(entry.pageCount ?? "—")}
      {cell(entry.annotationCount || "—")}
      {cell(entry.isLocal ? pdfText("source.local") : pdfText("source.remote"))}
      <span className="text-tau-sm text-ink-2 inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className={cn("size-1.5 rounded-full", INDEX_DOT[entry.index])} />
        {pdfText(`index.${entry.index}`)}
      </span>
      {cell(pdfFormat.day(entry.openedAt))}
      <MoreMenu
        entry={entry}
        actions={actions}
        className="ease-tau-out opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100"
      />
    </div>
  );
}
