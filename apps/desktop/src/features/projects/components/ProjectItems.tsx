/** 项目列表条目：「最近打开」续读卡、网格卡、列表行（点列头排序）。项目没有封面，网格即卡片 */

import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp, FileText, FolderTree } from "lucide-react";
import { cn } from "@tau/ui";
import { CardOps, PinnedStar } from "@/features/shared/cockpit/EntityCards";
import { CARD_HOVER } from "@/features/shared/cockpit/styles";
import { cockpitExcerpt, cockpitRelativeTime } from "@/features/shared/cockpit/text";
import type { CockpitCardHandlers } from "@/features/shared/cockpit/types";
import {
  formatDate,
  formatOpenedAt,
  projectTimeMeta,
  type ProjectListItem,
  type ProjectSort,
} from "../model";
import { PROJECT_VISUAL } from "../visual";

const ICON_SIZES = {
  sm: ["size-[26px] rounded-[8px]", "size-[14px]"],
  md: ["size-8 rounded-[10px]", "size-4"],
  lg: ["size-[42px] rounded-[12px]", "size-[19px]"],
} as const;

function ProjectIcon({ size }: { size: keyof typeof ICON_SIZES }) {
  const [box, glyph] = ICON_SIZES[size];
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center",
        box,
        PROJECT_VISUAL.softClass,
        PROJECT_VISUAL.textClass
      )}
    >
      <FolderTree className={glyph} strokeWidth={1.9} />
    </span>
  );
}

function ProjectTitle({ item, className }: { item: ProjectListItem; className: string }) {
  return (
    <h3 className={cn("flex min-w-0 items-center gap-1.5", className)}>
      {item.pinned && <PinnedStar />}
      <span className="truncate">{item.title || `项目 #${item.id}`}</span>
    </h3>
  );
}

function LastDoc({ title, className }: { title: string; className?: string }) {
  return (
    <p className={cn("text-ink-2 flex min-w-0 items-center gap-1.5 text-[12px]", className)}>
      <FileText className="text-ink-3 size-[13px] shrink-0" strokeWidth={1.75} />
      <span className="text-ink-3 shrink-0">上次看到</span>
      <span className="truncate">{title}</span>
    </p>
  );
}

/* ---------- 最近打开：续读卡 ---------- */

export function ProjectRecentCard({
  item,
  onOpen,
}: {
  item: ProjectListItem;
  onOpen(item: ProjectListItem): void;
}) {
  return (
    <article
      tabIndex={0}
      onClick={() => onOpen(item)}
      className={cn(
        "bg-surface ease-tau-out group relative flex cursor-pointer gap-3.5 overflow-hidden rounded-[var(--tau-radius-lg)] px-4 pb-3 pt-3.5",
        CARD_HOVER
      )}
    >
      <span
        aria-hidden
        className={cn("absolute inset-x-0 top-0 h-[3px]", PROJECT_VISUAL.barClass)}
      />
      <ProjectIcon size="lg" />
      <div className="min-w-0 flex-1">
        <ProjectTitle item={item} className="text-[14.5px] font-semibold tracking-[-0.005em]" />
        {item.lastItemTitle && <LastDoc title={item.lastItemTitle} className="mt-1" />}
        <p className="text-ink-3 mt-1.5 text-[11.5px] tabular-nums">
          {item.openedAt !== null && formatOpenedAt(item.openedAt)} · {item.metric} 个文档
        </p>
      </div>
      <span className="bg-accent-soft text-accent-text absolute bottom-3 right-3.5 inline-flex h-[26px] items-center gap-1 rounded-[8px] px-2.5 text-[12px] font-medium opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
        继续
        <ArrowRight className="size-[13px]" strokeWidth={1.75} />
      </span>
    </article>
  );
}

/* ---------- 网格卡：简介两行 + 上次看到 + meta（压底，同行等高） ---------- */

export function ProjectGridCard({
  item,
  sort,
  handlers,
}: {
  item: ProjectListItem;
  sort: ProjectSort;
  handlers: CockpitCardHandlers;
}) {
  const excerpt = cockpitExcerpt(item.desc);
  return (
    <article
      tabIndex={0}
      onClick={() => handlers.onOpen(item)}
      className={cn(
        "bg-surface ease-tau-out group relative flex cursor-pointer flex-col rounded-[var(--tau-radius-md)] px-4 pb-[13px] pt-3.5",
        CARD_HOVER,
        item.archived && "opacity-60 hover:opacity-100"
      )}
    >
      <CardOps item={item} handlers={handlers} />
      <div className="flex min-w-0 items-center gap-2.5 pr-14">
        <ProjectIcon size="md" />
        <ProjectTitle item={item} className="text-[14.5px] font-semibold tracking-[-0.005em]" />
      </div>
      {excerpt && (
        <p className="text-ink-2 mt-2 line-clamp-2 text-[12.5px] leading-[1.6]">{excerpt}</p>
      )}
      <div className="mt-auto flex flex-col gap-2.5 pt-3">
        {item.lastItemTitle && (
          <LastDoc title={item.lastItemTitle} className="bg-hover rounded-tau-sm h-[30px] px-2.5" />
        )}
        <p className="text-ink-3 flex items-center gap-2 text-[11.5px] tabular-nums">
          <span>{item.metric} 个文档</span>
          <span className="bg-ink-3 size-[2.5px] rounded-full opacity-60" />
          <span>{projectTimeMeta(item, sort)}</span>
        </p>
      </div>
    </article>
  );
}

/* ---------- 列表：行式无横线，列头排序 ---------- */

const LIST_COLS =
  "grid grid-cols-[minmax(240px,1fr)_56px_minmax(150px,220px)_80px_96px_56px] items-center gap-4";

export function ProjectListRows({
  items,
  sort,
  onSort,
  handlers,
  showHead = true,
}: {
  items: ProjectListItem[];
  sort: ProjectSort;
  onSort?(sort: ProjectSort): void;
  handlers: CockpitCardHandlers;
  /** 归档段沿用主列表的列宽，不重复列头 */
  showHead?: boolean;
}) {
  const head = (key: ProjectSort, label: string) => {
    const Arrow = key === "name" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => onSort?.(key)}
        className={cn(
          "hover:text-ink-1 inline-flex items-center gap-0.5 text-left",
          sort === key && "text-ink-1 font-medium"
        )}
      >
        {label}
        {sort === key && <Arrow className="size-3" strokeWidth={2} />}
      </button>
    );
  };
  return (
    <div className="-mx-3">
      {showHead && (
        <div className={cn(LIST_COLS, "text-tau-sm text-ink-3 px-3 py-2")}>
          {head("name", "名称")}
          <span className="text-right">文档</span>
          {head("opened", "上次打开")}
          {head("updated", "更新")}
          {head("created", "创建")}
          <span />
        </div>
      )}
      {items.map(item => (
        <Row key={item.id} item={item} handlers={handlers} />
      ))}
    </div>
  );
}

function Row({ item, handlers }: { item: ProjectListItem; handlers: CockpitCardHandlers }) {
  const excerpt = cockpitExcerpt(item.desc);
  const cell = (children: ReactNode, className?: string) => (
    <span className={cn("text-tau-sm text-ink-2 truncate tabular-nums", className)}>
      {children}
    </span>
  );
  return (
    <div
      tabIndex={0}
      onClick={() => handlers.onOpen(item)}
      onKeyDown={e => {
        if (e.key === "Enter" && e.target === e.currentTarget) handlers.onOpen(item);
      }}
      className={cn(
        LIST_COLS,
        "hover:bg-hover group relative min-h-[54px] w-full cursor-pointer rounded-[var(--tau-radius-md)] px-3 py-2 outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
        item.archived && "opacity-60 hover:opacity-100"
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <ProjectIcon size="sm" />
        <div className="min-w-0">
          <ProjectTitle item={item} className="text-[13.5px] font-medium" />
          {excerpt && <p className="text-ink-3 truncate text-[11.5px]">{excerpt}</p>}
        </div>
      </div>
      {cell(item.metric, "text-right")}
      <span className="min-w-0">
        {item.openedAt === null ? (
          cell("未打开过", "text-ink-3 block")
        ) : (
          <>
            {cell(formatOpenedAt(item.openedAt), "block")}
            {item.lastItemTitle && (
              <span className="text-ink-3 block truncate text-[11.5px]">{item.lastItemTitle}</span>
            )}
          </>
        )}
      </span>
      {cell(cockpitRelativeTime(item.updateTime))}
      {cell(formatDate(item.createTime))}
      <CardOps
        item={item}
        handlers={handlers}
        className="static justify-end has-[[aria-expanded=true]]:opacity-100"
      />
    </div>
  );
}
