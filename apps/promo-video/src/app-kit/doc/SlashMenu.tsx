/**
 * 斜杠菜单（BlockPanel）重建：类名摘自 packages/editor/src/core/components/BlockPanel（List / Item）与 EditorContextMenu/menuClasses.ts。
 * 扁平列表、无分组、条目只有「图标块 + 标题 + 可选子菜单箭头」；滚动区限高 360、上下边缘按滚动状态渐隐（edge-fade-scroll）。
 * 子菜单是同样的面板，贴在父条目右侧 8px。
 */
import clsx from "clsx";
import type { CSSProperties } from "react";
import {
  AudioLines,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Code2,
  GitBranch,
  Globe,
  Heading1,
  Highlighter,
  Image,
  Layers,
  Link,
  List,
  ListChecks,
  ListOrdered,
  MessageSquare,
  Minus,
  Paperclip,
  Presentation,
  Quote,
  Sigma,
  Smile,
  Superscript,
  Table,
  Upload,
  Video,
  type LucideIcon,
} from "lucide-react";
import { SLASH_ITEMS, SLASH_MAX_HEIGHT, SLASH_ROW, type SlashIcon, type SlashItem } from "./slashItems";

export { SLASH_ITEMS } from "./slashItems";

const ICONS: Record<SlashIcon, LucideIcon> = {
  heading: Heading1,
  list: List,
  checks: ListChecks,
  ordered: ListOrdered,
  tabs: Layers,
  detail: ChevronDown,
  highlight: Highlighter,
  quote: Quote,
  callout: MessageSquare,
  bookmark: Bookmark,
  divider: Minus,
  table: Table,
  audio: AudioLines,
  video: Video,
  annotation: Superscript,
  mermaid: GitBranch,
  plantuml: Image,
  code: Code2,
  math: Sigma,
  emoji: Smile,
  web: Globe,
  image: Image,
  file: Paperclip,
  board: Presentation,
  upload: Upload,
  link: Link,
  speech: AudioLines,
};

const PANEL =
  "w-max max-w-[280px] min-w-[180px] rounded-[18px] border border-solid border-[var(--tau-line-2)] bg-[var(--tau-bg-surface)] p-[8px] pr-[2px] text-[var(--tau-ink-1)] shadow-[var(--tau-shadow-float)] backdrop-blur-[18px] backdrop-saturate-[180%]";

function Panel({ items, active, scroll, style }: { items: SlashItem[]; active: number; scroll: number; style?: CSSProperties }) {
  const height = Math.min(SLASH_MAX_HEIGHT, items.length * SLASH_ROW - 2);
  const top = scroll > 0 ? 12 : 0;
  const bottom = scroll + height < items.length * SLASH_ROW - 2 ? 12 : 0;
  return (
    <div data-slash-panel className={PANEL} style={style}>
      <div className="relative inline-block w-max min-w-[220px] overflow-hidden">
        <div
          className="flex flex-col gap-[2px] overflow-hidden border-r-[2px] border-r-transparent pr-[6px]"
          style={{ height, maskImage: `linear-gradient(180deg, transparent 0, #000 ${top}px, #000 calc(100% - ${bottom}px), transparent 100%)` }}
        >
          <div className="flex flex-col gap-[2px]" style={{ transform: `translateY(${-scroll}px)` }}>
            {items.map((item, i) => {
              const Icon = ICONS[item.icon];
              return (
                <div
                  key={item.title + i}
                  className={clsx(
                    "flex w-full items-center gap-[10px] rounded-[12px] p-[6px_10px] text-left text-[14px]",
                    i === active && "bg-[var(--tau-bg-selected)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tau-accent)_25%,transparent)]"
                  )}
                >
                  <span className="flex size-[28px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--tau-bg-press)]">
                    <Icon className="size-[16px] text-[var(--tau-ink-2)]" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{item.title}</span>
                  {item.children && (
                    <span className="ml-[8px] flex items-center justify-center text-[12px] opacity-60">
                      <ChevronRight size={14} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * items 缺省为全部条目（搜索时传过滤后的叶子）；sub 是打开的子菜单：父条目下标、子菜单里的高亮下标。
 */
export function SlashMenu({
  items = SLASH_ITEMS,
  active,
  scroll = 0,
  open = 1,
  sub,
}: {
  items?: SlashItem[];
  active: number;
  scroll?: number;
  open?: number;
  sub?: { parent: number; active: number; open?: number };
}) {
  if (!items.length) return null;
  const parent = sub ? items[sub.parent] : undefined;
  return (
    <div className="relative" style={{ opacity: open, transform: `translateY(${(1 - open) * 6}px) scale(${0.98 + 0.02 * open})`, transformOrigin: "top left" }}>
      <Panel items={items} active={sub ? sub.parent : active} scroll={scroll} />
      {sub && parent?.children && (
        <Panel
          items={parent.children}
          active={sub.active}
          scroll={0}
          style={{
            position: "absolute",
            left: "calc(100% + 8px)",
            top: 8 + sub.parent * SLASH_ROW - scroll,
            opacity: sub.open ?? 1,
            transform: `translateX(${(1 - (sub.open ?? 1)) * -6}px)`,
          }}
        />
      )}
    </div>
  );
}
