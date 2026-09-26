/**
 * 白板卡片（方案 A 画廊，mockups/whiteboards/plan-a2-gallery.html）：
 * 缩略图 + 标题 + 一行描述 + 「N 页 · N 个元素 · 更新时间」；标签作徽标压在缩略图左下角。
 * 缩略图：自定义封面优先，否则第一页的结构示意图（schematic.ts，由页数据直接生成）；多页白板在缩略图上横向移动即翻页，
 * 点下去打开的就是看到的那页。悬停件（页名、页码刻度、更多）都占固定槽位原位淡入，不顶开布局。
 */

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CornerDownLeft,
  Files,
  Hash,
  ImageMinus,
  ImagePlus,
  MoreHorizontal,
  PencilLine,
  Play,
  Presentation,
  Trash2,
} from "lucide-react";
import LocalImage from "@/components/LocalImage";
import { IconButton, Menu, cn } from "@tau/ui";
import {
  displayTitle,
  fullTime,
  relativeTime,
  titleHit,
  type WhiteboardItem,
  type WhiteboardPage,
} from "../model";
import { PageSchematic } from "@/components/WhiteBoard/schematic/PageSchematic";

function MenuIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="size-[15px] shrink-0" strokeWidth={1.75} />;
}

/** 缩略图上最多平铺的标签数，其余折成 +N */
const MAX_TAGS = 3;

/** 缩略图角上的小徽标（页数 / 标签共用） */
const BADGE =
  "text-tau-tiny text-ink-2 bg-surface/90 inline-flex h-5 items-center gap-1 rounded-[6px] px-[7px]";

/** 画布纸底 + 点阵（示意图的底） */
const CANVAS_BG =
  "bg-surface-hover bg-[radial-gradient(color-mix(in_srgb,var(--tau-ink-1)_13%,transparent)_1px,transparent_1.2px)] bg-[length:14px_14px]";

export interface WhiteboardCardProps {
  item: WhiteboardItem;
  now: number;
  /** 标题过滤词（命中处高亮） */
  query: string;
  onOpen(item: WhiteboardItem, pageIndex?: number): void;
  onEdit(item: WhiteboardItem): void;
  onPickCover(item: WhiteboardItem): void;
  onRemoveCover(item: WhiteboardItem): void;
  onDelete(item: WhiteboardItem): void;
}

export function WhiteboardCard(props: WhiteboardCardProps) {
  const { item, now, query } = props;
  const multi = item.pages.length > 1;
  // null = 未在扫页（显示封面或第一页）
  const [scrub, setScrub] = useState<number | null>(null);
  const [failedCover, setFailedCover] = useState<string>();
  const cover = item.snapshot && item.snapshot !== failedCover ? item.snapshot : "";
  const shownIndex = scrub ?? 0;
  const shownPage = item.pages[shownIndex];

  let visual: ReactNode;
  if (cover && scrub === null) {
    visual = (
      <LocalImage
        url={cover}
        className="absolute inset-0 h-full w-full object-cover"
        onLoadError={() => setFailedCover(cover)}
      />
    );
  } else {
    visual = <PageThumb page={shownPage} />;
  }

  const menu = (
    <>
      <Menu.Item icon={<MenuIcon icon={CornerDownLeft} />} onSelect={() => props.onOpen(item)}>
        打开
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item icon={<MenuIcon icon={PencilLine} />} onSelect={() => props.onEdit(item)}>
        编辑信息
      </Menu.Item>
      <Menu.Item icon={<MenuIcon icon={ImagePlus} />} onSelect={() => props.onPickCover(item)}>
        {item.snapshot ? "更换封面" : "设置封面"}
      </Menu.Item>
      {item.snapshot && (
        <Menu.Item icon={<MenuIcon icon={ImageMinus} />} onSelect={() => props.onRemoveCover(item)}>
          移除封面
        </Menu.Item>
      )}
      <Menu.Separator />
      <Menu.Item danger icon={<MenuIcon icon={Trash2} />} onSelect={() => props.onDelete(item)}>
        删除
      </Menu.Item>
    </>
  );

  return (
    <article
      tabIndex={0}
      data-whiteboard-id={item.id}
      onClick={() => props.onOpen(item, scrub ?? undefined)}
      onKeyDown={e => {
        if (e.key === "Enter" && e.target === e.currentTarget) props.onOpen(item);
      }}
      className={cn(
        "bg-surface border-line-1 ease-tau-out group relative flex cursor-pointer flex-col rounded-[var(--tau-radius-lg)] border p-1.5",
        // 落在白板页那张纸上：细描边分隔（同文章 / 卡片卡），纸上再叠阴影卡会糊成一片。
        // hover 无位移（D-013「反馈是光的」），反馈 = lift 轻抬阴影 + 描边隐去
        "hover:shadow-lift transition-[box-shadow,border-color] duration-200 hover:border-transparent",
        "focus-visible:shadow-[var(--tau-focus-ring)] focus-visible:outline-none"
      )}
    >
      {/* 缩略图 */}
      <div
        className={cn(
          "relative aspect-[16/10] overflow-hidden rounded-[11px] shadow-[inset_0_0_0_1px_var(--tau-line-2)]",
          CANVAS_BG
        )}
        onMouseMove={
          multi
            ? e => {
                const r = e.currentTarget.getBoundingClientRect();
                const i = Math.floor(((e.clientX - r.left) / r.width) * item.pages.length);
                setScrub(Math.min(item.pages.length - 1, Math.max(0, i)));
              }
            : undefined
        }
        onMouseLeave={multi ? () => setScrub(null) : undefined}
      >
        {visual}
        {item.tags.length > 0 && (
          // 与页数同理：悬停时让位给底部页码刻度
          <div
            className={cn(
              "ease-tau-out pointer-events-none absolute bottom-2 left-2 flex min-w-0 gap-1 transition-opacity duration-150",
              multi ? "right-[64px] group-hover:opacity-0" : "right-2"
            )}
          >
            {item.tags.slice(0, MAX_TAGS).map(tag => (
              <span key={tag} className={cn(BADGE, "min-w-0")}>
                <Hash className="size-[10px] shrink-0" strokeWidth={1.75} />
                <span className="truncate">{tag}</span>
              </span>
            ))}
            {item.tags.length > MAX_TAGS && (
              <span className={cn(BADGE, "shrink-0 tabular-nums")}>
                +{item.tags.length - MAX_TAGS}
              </span>
            )}
          </div>
        )}
        {multi && (
          <>
            {/* 常态：右下页数；悬停：换成左上页名 + 底部页码刻度 */}
            <span
              className={cn(
                BADGE,
                "ease-tau-out absolute bottom-2 right-2 tabular-nums transition-opacity duration-150 group-hover:opacity-0"
              )}
            >
              <Files className="size-[11px]" strokeWidth={1.75} />
              {item.pages.length} 页
            </span>
            <span className="text-tau-tiny text-ink-2 bg-surface/90 shadow-lift ease-tau-out pointer-events-none absolute left-2 top-2 inline-flex h-[22px] max-w-[calc(100%-60px)] items-center gap-1.5 rounded-[7px] px-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <b className="font-tau-mono text-ink-3 text-[11px] font-medium">
                {shownIndex + 1}/{item.pages.length}
              </b>
              <span className="truncate">{shownPage?.name || "未命名"}</span>
            </span>
            <div className="ease-tau-out pointer-events-none absolute bottom-2 left-2.5 right-2.5 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {item.pages.map((p, i) => (
                <i
                  key={p.id}
                  className={cn(
                    "h-[3px] flex-1 rounded-full transition-colors duration-100",
                    i === shownIndex ? "bg-accent" : "bg-ink-1/15"
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* 更多：固定槽位淡入；菜单开着时保持可见 */}
      <div
        className="ease-tau-out absolute right-3.5 top-3.5 z-[1] opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 has-[[aria-expanded=true]]:opacity-100"
        onClick={e => e.stopPropagation()}
      >
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
          {menu}
        </Menu>
      </div>

      {/* 主体 */}
      <div className="flex min-w-0 flex-1 flex-col px-2 pb-1.5 pt-2.5">
        <h3 className="text-ink-1 truncate text-[14px] font-semibold leading-[1.45]">
          <Highlight text={displayTitle(item)} query={query} />
        </h3>
        <p className="text-tau-meta text-ink-2 mt-px h-5 truncate">{item.description}</p>
        <p className="text-ink-3 mt-1.5 flex items-center gap-1.5 whitespace-nowrap text-[12px] tabular-nums">
          <span>{item.pages.length} 页</span>
          <Dot />
          <span>{item.elementCount} 个元素</span>
          <Dot />
          <span title={fullTime(item.updateTime)}>{relativeTime(item.updateTime, now)}更新</span>
          {item.sequences > 0 && (
            <span
              className="text-accent-text ml-auto inline-flex items-center gap-[3px]"
              title={`有 ${item.sequences} 个演示序列`}
            >
              <Play className="size-[11px]" strokeWidth={1.75} />
              可演示
            </span>
          )}
        </p>
      </div>
    </article>
  );
}

function PageThumb({ page }: { page?: WhiteboardPage }) {
  if (page && page.elementCount > 0)
    return (
      <PageSchematic
        elements={page.elements}
        aspect={16 / 10}
        className="absolute inset-0 h-full w-full"
      />
    );
  return (
    <div className="text-ink-3 absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[12px]">
      <Presentation className="size-5" strokeWidth={1.5} />
      <span>空白画布</span>
    </div>
  );
}

function Dot() {
  return <i className="size-[2px] rounded-full bg-current" />;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const hit = titleHit(text, query);
  if (!hit) return <>{text}</>;
  return (
    <>
      {text.slice(0, hit[0])}
      <mark className="rounded-[3px] bg-[color-mix(in_srgb,var(--tau-accent)_22%,transparent)] px-px text-inherit">
        {text.slice(hit[0], hit[1])}
      </mark>
      {text.slice(hit[1])}
    </>
  );
}
