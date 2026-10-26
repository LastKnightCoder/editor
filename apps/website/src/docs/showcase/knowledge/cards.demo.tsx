/**
 * 卡片库：等高卡片墙，侧栏标签树筛选。点标签只看这一类，再点一次回到全部。
 * 结构按 features/cards 的 CardsView、CardWallList、CardItemView 与 CardsNav 重建。
 */
import { useState } from "react";
import { Maximize2, MoreHorizontal, Pin, Plus, X } from "lucide-react";
import { Button, Tag, cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

interface Card {
  id: number;
  text: string;
  tags: string[];
  links: number;
  date: string;
  pinned?: boolean;
}

const CARDS: Card[] = [
  {
    id: 1,
    text: "专注不是一种性格，而是一种可以练习的能力。像肌肉一样，越用越强。",
    tags: ["读书/深度工作"],
    links: 3,
    date: "10-26",
    pinned: true,
  },
  {
    id: 2,
    text: "浅层工作会挤占深度工作：回复消息带来的满足感，是一种虚假的生产力。",
    tags: ["读书/深度工作", "工作"],
    links: 2,
    date: "10-26",
  },
  {
    id: 3,
    text: "间隔重复的关键不是重复，而是间隔：在快要忘记的时候想起来，记得最牢。",
    tags: ["读书/学习方法"],
    links: 1,
    date: "10-25",
  },
  {
    id: 4,
    text: "选题会：读者想带走的是一个能马上用的方法，而不是一套理论。",
    tags: ["工作"],
    links: 0,
    date: "10-25",
  },
  {
    id: 5,
    text: "费曼技巧：如果你没法用简单的话讲给外行听，说明你还没真懂。",
    tags: ["读书/学习方法"],
    links: 2,
    date: "10-24",
  },
  {
    id: 6,
    text: "散步时想清楚的事，比坐在桌前想一下午还多。",
    tags: ["随想"],
    links: 0,
    date: "10-23",
  },
];

const TREE: { name: string; children?: string[] }[] = [
  { name: "读书", children: ["深度工作", "学习方法"] },
  { name: "工作" },
  { name: "随想" },
];

const matches = (card: Card, tag: string | null) =>
  !tag || card.tags.some(name => name === tag || name.startsWith(`${tag}/`));

function CardItem({ card }: { card: Card }) {
  return (
    <article
      className="bg-surface border-line-1 ease-tau-out group hover:border-line-2 animate-doc-in flex cursor-pointer flex-col gap-2 rounded-[var(--tau-radius-md)] border p-[13px] pb-[11px] transition-[border-color] duration-200"
      style={card.pinned ? { borderColor: "var(--tau-accent)" } : undefined}
    >
      <div className="flex h-[22px] items-center gap-1.5 text-[11px]">
        {card.pinned && <Pin className="text-accent size-3 shrink-0" strokeWidth={1.75} />}
        <span className="flex-1" />
        <div className="flex gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <span className="hover:bg-hover text-ink-2 grid size-[22px] place-items-center rounded-[7px]">
            <Maximize2 className="size-[13px]" strokeWidth={1.75} />
          </span>
          <span className="hover:bg-hover text-ink-2 grid size-[22px] place-items-center rounded-[7px]">
            <MoreHorizontal className="size-[13px]" strokeWidth={1.75} />
          </span>
        </div>
      </div>
      <p className="text-tau-body line-clamp-3 min-h-[4.9em] leading-[1.65]">{card.text}</p>
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {card.tags.slice(0, 1).map(tag => (
            <Tag key={tag}>{tag}</Tag>
          ))}
          {card.tags.length > 1 && <Tag>+{card.tags.length - 1}</Tag>}
        </div>
        <span className="text-ink-3 flex shrink-0 items-center gap-2 text-[10.5px] tabular-nums">
          {card.links > 0 && <span className="text-info">{card.links} 连接</span>}
          <span>{card.text.length} 字</span>
          <span>{card.date}</span>
        </span>
      </div>
    </article>
  );
}

export default function CardsDemo() {
  const [tag, setTag] = useState<string | null>(null);
  const shown = CARDS.filter(card => matches(card, tag));
  const words = shown.reduce((sum, card) => sum + card.text.length, 0);

  const tagRow = (path: string, label: string, depth: number) => {
    const count = CARDS.filter(card => matches(card, path)).length;
    const on = tag === path;
    return (
      <button
        key={path}
        type="button"
        onClick={() => setTag(on ? null : path)}
        title={on ? "再点一次回到全部" : `只看「${label}」`}
        className={cn(
          "text-tau-sm flex h-7 w-full items-center gap-1.5 rounded-[8px] pr-2 text-left transition-colors",
          on ? "bg-selected text-accent-text font-medium" : "text-ink-2 hover:bg-hover"
        )}
        style={{ paddingLeft: 12 + depth * 14 }}
      >
        <span className="text-ink-3">#</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-ink-3 text-tau-tiny tabular-nums">{count}</span>
      </button>
    );
  };

  return (
    <AppWindow active="cards" crumb="卡片库 / 卡片墙" sidebar="none" height={440} paper={false}>
      <div className="flex h-full gap-3">
        <aside className="w-[168px] shrink-0 pt-2 max-sm:hidden">
          <p className="text-tau-tiny text-ink-3 px-3 pb-1.5">卡片库 · 标签</p>
          {TREE.map(node => (
            <div key={node.name}>
              {tagRow(node.name, node.name, 0)}
              {node.children?.map(child => tagRow(`${node.name}/${child}`, child, 1))}
            </div>
          ))}
        </aside>
        <div className="bg-surface shadow-paper flex min-w-0 flex-1 flex-col overflow-hidden rounded-[12px]">
          <div className="mt-5 mb-2 flex h-10 shrink-0 items-center gap-3 px-6">
            <h3 className="text-tau-title-lg font-semibold tracking-[-0.01em]">卡片库</h3>
            {tag && (
              <button
                type="button"
                title="清除标签筛选"
                onClick={() => setTag(null)}
                className="bg-selected text-accent-text inline-flex h-6 items-center gap-1 rounded-full pr-1.5 pl-2.5 text-[12px] font-medium"
              >
                {tag}
                <X className="size-3" strokeWidth={2} />
              </button>
            )}
            <span className="text-tau-meta text-ink-2 min-w-0 flex-1 truncate tabular-nums">
              {tag ? "找到" : "共"} <b className="text-ink-1 font-semibold">{shown.length}</b> 张 ·
              累计 <b className="text-ink-1 font-semibold">{words}</b> 字
            </span>
            <Button size="sm" variant="primary" icon={Plus} className="max-sm:hidden">
              新建卡片
            </Button>
          </div>
          <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-6 pb-5">
            <div className="mb-3 flex items-center gap-2 pt-2">
              <b className="text-ink-2 text-[13px] font-semibold">{tag ? "筛选结果" : "本周"}</b>
              <span className="text-ink-3 text-[12px]">{shown.length} 张</span>
              <span className="bg-line-1 h-px flex-1" />
            </div>
            <div
              key={tag ?? "all"}
              className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3"
            >
              {shown.map(card => (
                <CardItem key={card.id} card={card} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}
