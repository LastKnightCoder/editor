/**
 * 项目卡两形态（方案 C 驾驶舱）：
 * - ProjectHeroCard ——「继续学习」升格大卡（类型色顶缘 + 大标题 + 两行摘要 +
 *   子项计数大数字 + 「进入项目」行动位）；
 * - ProjectMiniCard ——「全部项目」紧凑卡（单行摘要 + meta 行）。
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
import type { ProjectPageItem } from "../types";
import { projectTypeMeta } from "../projectTypeMeta";
import { projectExcerpt, projectRelativeTime } from "../queries";

/** hero / mini 卡共用的操作协议（宿主 ProjectsView 提供） */
export interface ProjectCardHandlers {
  onOpen(project: ProjectPageItem): void;
  onTogglePin(project: ProjectPageItem): void;
  onSetArchived(project: ProjectPageItem, archived: boolean): void;
  onEdit(project: ProjectPageItem): void;
  onExport(project: ProjectPageItem): void;
  onDelete(project: ProjectPageItem): void;
}

/* Menu.Item 的 icon 槽统一 15px lucide 线性图标 */
function MenuIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="size-[15px] shrink-0" strokeWidth={1.75} />;
}

/* hover 浮现的操作钮底色（surface 卡上的浅底小方块，同 ArticleCard CoverOps） */
const OPS_BTN =
  "shadow-card size-[23px] rounded-[7px] bg-[rgba(255,248,239,0.86)] enabled:hover:bg-[#fff8ef]";

/** 卡片 hover 反馈：lift 轻抬阴影（2026-09-23 用户校准——float 浮层档又大又重，
    新增 lift 档贴近纸面的浅晕）+ 1px 描边亮起（双主题都醒目，无位移） */
const CARD_HOVER =
  "transition-[box-shadow,outline-color] duration-200 outline-line-1 hover:shadow-lift outline-0 -outline-offset-1 hover:outline-1";

function CardOps({
  project,
  handlers,
}: {
  project: ProjectPageItem;
  handlers: ProjectCardHandlers;
}) {
  return (
    <div
      className="absolute right-3.5 top-3.5 z-[1] flex gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
      onClick={e => e.stopPropagation()}
    >
      <IconButton
        title={project.pinned ? "取消置顶" : "置顶"}
        onClick={() => handlers.onTogglePin(project)}
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
        <Menu.Item onSelect={() => handlers.onEdit(project)} icon={<MenuIcon icon={Pencil} />}>
          编辑项目信息
        </Menu.Item>
        <Menu.Item
          onSelect={() => handlers.onSetArchived(project, !project.archived)}
          icon={<MenuIcon icon={project.archived ? ArchiveRestore : Archive} />}
        >
          {project.archived ? "取消归档" : "归档项目"}
        </Menu.Item>
        <Menu.Item
          onSelect={() => handlers.onExport(project)}
          icon={<MenuIcon icon={ArrowRight} />}
        >
          整体导出
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item
          danger
          onSelect={() => handlers.onDelete(project)}
          icon={<MenuIcon icon={Trash2} />}
        >
          删除项目
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

export function ProjectHeroCard({
  project,
  handlers,
}: {
  project: ProjectPageItem;
  handlers: ProjectCardHandlers;
}) {
  const meta = projectTypeMeta(project.projectType);
  const Icon = meta.icon;
  const excerpt = projectExcerpt(project.desc);

  return (
    <article
      tabIndex={0}
      onClick={() => handlers.onOpen(project)}
      className={cn(
        "bg-surface shadow-card ease-tau-out group relative flex cursor-pointer flex-col overflow-hidden rounded-[var(--tau-radius-lg)] px-[22px] pb-[17px] pt-[19px]",
        CARD_HOVER,
        project.archived && "opacity-60 hover:opacity-100"
      )}
    >
      {/* 类型色顶缘（3px 向右渐隐——卡片的类型身份线，替代无封面项目的封面位） */}
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px]", meta.barClass)} />
      <CardOps project={project} handlers={handlers} />
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-10 place-items-center rounded-[12px]",
            meta.softClass,
            meta.textClass
          )}
        >
          <Icon className="size-[19px]" strokeWidth={1.9} />
        </span>
        <span
          className={cn(
            "whitespace-nowrap rounded-full px-[9px] py-px text-[11px] font-medium",
            meta.softClass,
            meta.textClass
          )}
        >
          {meta.label}
        </span>
        <span className="text-ink-3 ml-auto pr-16 text-[11.5px] tabular-nums">
          {projectRelativeTime(project.updateTime)}更新
        </span>
      </div>
      <h2 className="mt-2.5 flex items-center gap-1.5 text-[17.5px] font-semibold leading-[1.4] tracking-[-0.01em]">
        {project.pinned && <PinnedStar />}
        <span className="truncate">{project.title || `项目 #${project.id}`}</span>
      </h2>
      {excerpt && (
        <p className="text-ink-2 mt-[5px] line-clamp-2 min-h-[41px] text-[12.5px] leading-[1.65]">
          {excerpt}
        </p>
      )}
      <div className="mt-auto flex items-end gap-5 pt-3.5">
        <div>
          <div className="text-[21px] font-[650] tabular-nums leading-[1.1] tracking-[-0.02em]">
            {project.itemCount}
          </div>
          <div className="text-ink-3 mt-0.5 text-[11px]">个文档</div>
        </div>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            handlers.onOpen(project);
          }}
          /* hover 档是 accent 定稿值的 alpha 派生（arbitrary 注明出处，同热力图色阶口径） */
          className="bg-accent-soft text-accent-text ml-auto inline-flex h-[30px] items-center gap-1.5 rounded-[9px] px-[13px] text-[12.5px] font-medium transition-colors duration-150 hover:bg-[rgba(217,119,87,0.2)]"
        >
          进入项目
          <ArrowRight className="size-[13px]" strokeWidth={1.75} />
        </button>
      </div>
    </article>
  );
}

/* ---------- 紧凑卡 ---------- */

export function ProjectMiniCard({
  project,
  handlers,
}: {
  project: ProjectPageItem;
  handlers: ProjectCardHandlers;
}) {
  const meta = projectTypeMeta(project.projectType);
  const Icon = meta.icon;
  const excerpt = projectExcerpt(project.desc);

  return (
    <article
      tabIndex={0}
      onClick={() => handlers.onOpen(project)}
      className={cn(
        "bg-surface shadow-card ease-tau-out group relative flex cursor-pointer flex-col rounded-[var(--tau-radius-md)] px-[13px] pb-[10px] pt-[11px]",
        CARD_HOVER,
        project.archived && "opacity-60 hover:opacity-100"
      )}
    >
      <CardOps project={project} handlers={handlers} />
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "grid size-[26px] shrink-0 place-items-center rounded-[8px]",
            meta.softClass,
            meta.textClass
          )}
        >
          <Icon className="size-[14px]" strokeWidth={1.9} />
        </span>
        <h3 className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold tracking-[-0.005em]">
          {project.pinned && <PinnedStar />}
          <span className="truncate">{project.title || `项目 #${project.id}`}</span>
        </h3>
      </div>
      {excerpt && (
        <p className="text-ink-3 mt-[5px] truncate text-[12px] leading-[1.6]">{excerpt}</p>
      )}
      <p className="text-ink-3 mt-1.5 flex items-center gap-2 text-[11px] tabular-nums">
        <span>{project.itemCount} 个文档</span>
        <span className="bg-ink-3 size-[2.5px] rounded-full opacity-60" />
        <span>更新于 {projectRelativeTime(project.updateTime)}</span>
      </p>
    </article>
  );
}
