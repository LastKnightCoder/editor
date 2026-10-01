/**
 * 驾驶舱条目三形态（原 features/projects/components/ProjectCards.tsx，拆模块后配置化）：
 * - CockpitRecentCard —— 「最近打开」续读卡（身份色顶缘 + 上次看到 + 打开时间）；
 * - CockpitGridCard —— 网格卡（两行简介 + 上次看到 + meta，压底同行等高；条目没有封面，网格即卡片）；
 * - CockpitListRows —— 列表排布（行式无横线，点列头排序）。
 *
 * 操作对齐 ArticleCard 口径：hover = 阴影加深 + 1px 描边亮起（无位移）；
 * 操作钮 hover/focus 显现；⋯ 菜单承载编辑/置顶/归档/整体导出/删除。
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  FileText,
  MoreHorizontal,
  Pencil,
  Pin,
  Star,
  Trash2,
} from "lucide-react";
import { IconButton, Menu, cn } from "@tau/ui";
import type { CockpitCardHandlers, CockpitCopy, CockpitItem, CockpitVisual } from "./types";
import { cockpitExcerpt, cockpitRelativeTime } from "./text";
import { cockpitTimeMeta, formatDate, formatOpenedAt, type CockpitSort } from "./model";

interface ItemProps {
  item: CockpitItem;
  visual: CockpitVisual;
  copy: CockpitCopy;
}

/* Menu.Item 的 icon 槽统一 15px lucide 线性图标 */
function MenuIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="size-[15px] shrink-0" strokeWidth={1.75} />;
}

/* hover 浮现的操作钮：实底浮起小方块（bg-surface-hover 即「实底控件」档，浅主题略沉于卡面、
   深主题浮于卡面）+ 发丝描边。
   hover 背景必须显式覆写为同一实底——IconButton 基底的半透明 bg-hover 会把实底冲掉 */
const OPS_BTN =
  "shadow-card size-[23px] rounded-[7px] bg-surface-hover outline-1 -outline-offset-1 outline-line-1 enabled:hover:bg-surface-hover";

/** 卡片落在列表页那张纸上：细描边分隔，hover 时 lift 轻抬阴影、描边隐去（同 Skill 页卡片；
    纸上再叠阴影卡会糊成一片） */
const CARD_HOVER =
  "border border-line-1 transition-[box-shadow,border-color] duration-200 hover:shadow-lift hover:border-transparent";

/** 悬停浮现的置顶 + ⋯ 菜单（宿主须带 group 与定位上下文；className 覆盖默认的右上角定位） */
function CardOps({
  item,
  handlers,
  className,
}: {
  item: CockpitItem;
  handlers: CockpitCardHandlers;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute right-3.5 top-3.5 z-[1] flex gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100",
        className
      )}
      onClick={e => e.stopPropagation()}
    >
      <IconButton
        title={item.pinned ? "取消置顶" : "置顶"}
        onClick={() => handlers.onTogglePin(item)}
        className={OPS_BTN}
      >
        <Pin className="size-[13px]" strokeWidth={1.75} />
      </IconButton>
      <Menu
        align="end"
        trigger={
          <IconButton title="更多操作" className={OPS_BTN}>
            <MoreHorizontal className="size-[13px]" strokeWidth={1.75} />
          </IconButton>
        }
      >
        <Menu.Item onSelect={() => handlers.onEdit(item)} icon={<MenuIcon icon={Pencil} />}>
          编辑信息
        </Menu.Item>
        <Menu.Item
          onSelect={() => handlers.onSetArchived(item, !item.archived)}
          icon={<MenuIcon icon={item.archived ? ArchiveRestore : Archive} />}
        >
          {item.archived ? "取消归档" : "归档"}
        </Menu.Item>
        {handlers.onExport && (
          <Menu.Item
            onSelect={() => handlers.onExport?.(item)}
            icon={<MenuIcon icon={ArrowRight} />}
          >
            整体导出
          </Menu.Item>
        )}
        <Menu.Separator />
        <Menu.Item
          danger
          onSelect={() => handlers.onDelete(item)}
          icon={<MenuIcon icon={Trash2} />}
        >
          删除
        </Menu.Item>
      </Menu>
    </div>
  );
}

const ICON_SIZES = {
  sm: ["size-[26px] rounded-[8px]", "size-[14px]"],
  md: ["size-8 rounded-[10px]", "size-4"],
  lg: ["size-[42px] rounded-[12px]", "size-[19px]"],
} as const;

function EntityIcon({ visual, size }: { visual: CockpitVisual; size: keyof typeof ICON_SIZES }) {
  const [box, glyph] = ICON_SIZES[size];
  const Icon = visual.icon;
  return (
    <span
      className={cn("grid shrink-0 place-items-center", box, visual.softClass, visual.textClass)}
    >
      <Icon className={glyph} strokeWidth={1.9} />
    </span>
  );
}

function EntityTitle({
  item,
  copy,
  className,
}: {
  item: CockpitItem;
  copy: CockpitCopy;
  className: string;
}) {
  return (
    <h3 className={cn("flex min-w-0 items-center gap-1.5", className)}>
      {item.pinned && (
        <Star
          className="text-accent fill-accent size-[13px] shrink-0"
          strokeWidth={1.75}
          aria-label="已置顶"
        />
      )}
      <span className="truncate">{item.title || `${copy.title} #${item.id}`}</span>
    </h3>
  );
}

function LastItem({ title, className }: { title: string; className?: string }) {
  return (
    <p className={cn("text-ink-2 flex min-w-0 items-center gap-1.5 text-[12px]", className)}>
      <FileText className="text-ink-3 size-[13px] shrink-0" strokeWidth={1.75} />
      <span className="text-ink-3 shrink-0">上次看到</span>
      <span className="truncate">{title}</span>
    </p>
  );
}

/* ---------- 最近打开：续读卡 ---------- */

export function CockpitRecentCard({
  item,
  visual,
  copy,
  onOpen,
}: ItemProps & { onOpen(item: CockpitItem): void }) {
  return (
    <article
      tabIndex={0}
      onClick={() => onOpen(item)}
      className={cn(
        "bg-surface ease-tau-out group relative flex cursor-pointer gap-3.5 overflow-hidden rounded-[var(--tau-radius-lg)] px-4 pb-3 pt-3.5",
        CARD_HOVER
      )}
    >
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px]", visual.barClass)} />
      <EntityIcon visual={visual} size="lg" />
      <div className="min-w-0 flex-1">
        <EntityTitle
          item={item}
          copy={copy}
          className="text-[14.5px] font-semibold tracking-[-0.005em]"
        />
        {item.lastItemTitle && <LastItem title={item.lastItemTitle} className="mt-1" />}
        <p className="text-ink-3 mt-1.5 text-[11.5px] tabular-nums">
          {item.openedAt !== null && formatOpenedAt(item.openedAt)} · {item.metric}{" "}
          {copy.metricUnit}
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

export function CockpitGridCard({
  item,
  visual,
  copy,
  sort,
  handlers,
}: ItemProps & { sort: CockpitSort; handlers: CockpitCardHandlers }) {
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
        <EntityIcon visual={visual} size="md" />
        <EntityTitle
          item={item}
          copy={copy}
          className="text-[14.5px] font-semibold tracking-[-0.005em]"
        />
      </div>
      {excerpt && (
        <p className="text-ink-2 mt-2 line-clamp-2 text-[12.5px] leading-[1.6]">{excerpt}</p>
      )}
      <div className="mt-auto flex flex-col gap-2.5 pt-3">
        {item.lastItemTitle && (
          <LastItem
            title={item.lastItemTitle}
            className="bg-hover rounded-tau-sm h-[30px] px-2.5"
          />
        )}
        <p className="text-ink-3 flex items-center gap-2 text-[11.5px] tabular-nums">
          <span>
            {item.metric} {copy.metricUnit}
          </span>
          <span className="bg-ink-3 size-[2.5px] rounded-full opacity-60" />
          <span>{cockpitTimeMeta(item, sort)}</span>
        </p>
      </div>
    </article>
  );
}

/* ---------- 列表：行式无横线，列头排序 ---------- */

const LIST_COLS =
  "grid grid-cols-[minmax(240px,1fr)_64px_minmax(150px,220px)_80px_96px_56px] items-center gap-4";

export function CockpitListRows({
  items,
  visual,
  copy,
  sort,
  onSort,
  handlers,
  showHead = true,
}: {
  items: CockpitItem[];
  visual: CockpitVisual;
  copy: CockpitCopy;
  sort: CockpitSort;
  onSort?(sort: CockpitSort): void;
  handlers: CockpitCardHandlers;
  /** 归档段沿用主列表的列宽，不重复列头 */
  showHead?: boolean;
}) {
  const head = (key: CockpitSort, label: string) => {
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
          <span className="text-right">{copy.metricLabel}</span>
          {head("opened", "上次打开")}
          {head("updated", "更新")}
          {head("created", "创建")}
          <span />
        </div>
      )}
      {items.map(item => (
        <ListRow key={item.id} item={item} visual={visual} copy={copy} handlers={handlers} />
      ))}
    </div>
  );
}

function ListRow({ item, visual, copy, handlers }: ItemProps & { handlers: CockpitCardHandlers }) {
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
        <EntityIcon visual={visual} size="sm" />
        <div className="min-w-0">
          <EntityTitle item={item} copy={copy} className="text-[13.5px] font-medium" />
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
