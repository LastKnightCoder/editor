/**
 * 驾驶舱卡片两形态（原 features/projects/components/ProjectCards.tsx，拆模块后配置化）：
 * - EntityHeroCard —— 置顶段升格大卡（类型色顶缘 + 大标题 + 两行摘要 + 大数字 + 行动位）；
 * - EntityMiniCard —— 全部网格紧凑卡（单行摘要 + meta 行）。
 *
 * 操作对齐 ArticleCard 口径：hover = 阴影加深 + 1px 描边亮起（无位移）；
 * 操作钮 hover/focus 显现；⋯ 菜单承载编辑/置顶/归档/整体导出/删除。
 */

import type { LucideIcon } from "lucide-react";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  MoreHorizontal,
  Pencil,
  Pin,
  Star,
  Trash2,
} from "lucide-react";
import { IconButton, Menu, cn } from "@tau/ui";
import type { CockpitCardHandlers, CockpitCopy, CockpitItem, CockpitVisual } from "./types";
import { cockpitExcerpt, cockpitRelativeTime } from "./text";

interface CardProps {
  item: CockpitItem;
  visual: CockpitVisual;
  copy: CockpitCopy;
  handlers: CockpitCardHandlers;
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

function CardOps({ item, handlers }: { item: CockpitItem; handlers: CockpitCardHandlers }) {
  return (
    <div
      className="absolute right-3.5 top-3.5 z-[1] flex gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
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

function PinnedStar() {
  return (
    <Star
      className="text-accent fill-accent size-[13px] shrink-0"
      strokeWidth={1.75}
      aria-label="已置顶"
    />
  );
}

/* ---------- hero 大卡 ---------- */

export function EntityHeroCard({ item, visual, copy, handlers }: CardProps) {
  const Icon = visual.icon;
  const excerpt = cockpitExcerpt(item.desc);

  return (
    <article
      tabIndex={0}
      onClick={() => handlers.onOpen(item)}
      className={cn(
        "bg-surface ease-tau-out group relative flex cursor-pointer flex-col overflow-hidden rounded-[var(--tau-radius-lg)] px-[22px] pb-[17px] pt-[19px]",
        CARD_HOVER,
        item.archived && "opacity-60 hover:opacity-100"
      )}
    >
      {/* 类型色顶缘（3px 向右渐隐——卡片的类型身份线，替代无封面条目的封面位） */}
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px]", visual.barClass)} />
      <CardOps item={item} handlers={handlers} />
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-10 place-items-center rounded-[12px]",
            visual.softClass,
            visual.textClass
          )}
        >
          <Icon className="size-[19px]" strokeWidth={1.9} />
        </span>
        <span
          className={cn(
            "whitespace-nowrap rounded-full px-[9px] py-px text-[11px] font-medium",
            visual.softClass,
            visual.textClass
          )}
        >
          {copy.badgeLabel}
        </span>
        <span className="text-ink-3 ml-auto pr-16 text-[11.5px] tabular-nums">
          {cockpitRelativeTime(item.updateTime)}更新
        </span>
      </div>
      <h2 className="mt-2.5 flex items-center gap-1.5 text-[17.5px] font-semibold leading-[1.4] tracking-[-0.01em]">
        {item.pinned && <PinnedStar />}
        <span className="truncate">{item.title || `${copy.title} #${item.id}`}</span>
      </h2>
      {excerpt && (
        <p className="text-ink-2 mt-[5px] line-clamp-2 min-h-[41px] text-[12.5px] leading-[1.65]">
          {excerpt}
        </p>
      )}
      <div className="mt-auto flex items-end gap-5 pt-3.5">
        <div>
          <div className="text-[21px] font-[650] tabular-nums leading-[1.1] tracking-[-0.02em]">
            {item.metric}
          </div>
          <div className="text-ink-3 mt-0.5 text-[11px]">{copy.metricUnit}</div>
        </div>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            handlers.onOpen(item);
          }}
          /* hover 档是 accent 定稿值的 alpha 派生（arbitrary 注明出处，同热力图色阶口径） */
          className="bg-accent-soft text-accent-text ml-auto inline-flex h-[30px] items-center gap-1.5 rounded-[9px] px-[13px] text-[12.5px] font-medium transition-colors duration-150 hover:bg-[rgba(217,119,87,0.2)]"
        >
          进入
          <ArrowRight className="size-[13px]" strokeWidth={1.75} />
        </button>
      </div>
    </article>
  );
}

/* ---------- 紧凑卡 ---------- */

export function EntityMiniCard({ item, visual, copy, handlers }: CardProps) {
  const Icon = visual.icon;
  const excerpt = cockpitExcerpt(item.desc);

  return (
    <article
      tabIndex={0}
      onClick={() => handlers.onOpen(item)}
      className={cn(
        "bg-surface ease-tau-out group relative flex cursor-pointer flex-col rounded-[var(--tau-radius-md)] px-[13px] pb-[10px] pt-[11px]",
        CARD_HOVER,
        item.archived && "opacity-60 hover:opacity-100"
      )}
    >
      <CardOps item={item} handlers={handlers} />
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "grid size-[26px] shrink-0 place-items-center rounded-[8px]",
            visual.softClass,
            visual.textClass
          )}
        >
          <Icon className="size-[14px]" strokeWidth={1.9} />
        </span>
        <h3 className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold tracking-[-0.005em]">
          {item.pinned && <PinnedStar />}
          <span className="truncate">{item.title || `${copy.title} #${item.id}`}</span>
        </h3>
      </div>
      {excerpt && (
        <p className="text-ink-3 mt-[5px] truncate text-[12px] leading-[1.6]">{excerpt}</p>
      )}
      <p className="text-ink-3 mt-1.5 flex items-center gap-2 text-[11px] tabular-nums">
        <span>
          {item.metric} {copy.metricUnit}
        </span>
        <span className="bg-ink-3 size-[2.5px] rounded-full opacity-60" />
        <span>更新于 {cockpitRelativeTime(item.updateTime)}</span>
      </p>
    </article>
  );
}
