/**
 * 今日页「重温」段的「今日漫步」牌堆：每天固定几张旧内容，翻完即止（明天换新的一叠）。
 * 左列 = 错位叠放的牌堆（当前 + 后两张）与动作条，右列 = 今日进度列表；
 * 翻牌走乐观 cursor（setQueryData）+ daily-advance 落库，当前牌首次露出记 seen；
 * 牌堆池为空时整块（含小节标题）不渲染。牌堆容器聚焦时 → = 下一张（无全局快捷键）。
 */

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import type { Descendant } from "slate";
import { ChevronRight, EyeOff, Footprints, Shuffle } from "lucide-react";
import { Button, Panel, PanelAction, PanelNote, PanelTitle, cn, toast } from "@tau/ui";
import { usePage } from "@/page/PageProvider";
import {
  advanceRandomWalkDailyDeck,
  markRandomWalkSeen,
  muteRandomWalk,
  rerollRandomWalkDailyDeck,
} from "@/commands/random-walk";
import { CardContentPreview } from "@/features/cards/components/CardContentPreview";
import { openWalkItem } from "@/features/walk/open";
import { WALK_KIND_META, formatWalkWhy } from "@/features/walk/model";
import type { WalkDailyDeck, WalkItem } from "@/types";
import { useTodayWalkDeck, walkDeckKey } from "../walkDeckQueries";
import { SectionHeading } from "./SectionHeading";

/** 翻牌时长：飞出、前移、补位共用一条过渡，结束时才推进 cursor（飞走的牌不被截断） */
const FLIP_MS = 320;

/* Tailwind v4 的 translate-* / rotate-* / scale-* 写入独立的 translate / rotate / scale 属性，
   过渡必须列这三个属性而非 transform，否则位移会瞬间跳变 */
const CARD_BASE =
  "absolute inset-0 flex flex-col overflow-hidden rounded-tau-lg border border-line-1 bg-surface px-6 py-5 shadow-card " +
  "ease-tau-out transition-[translate,rotate,scale,opacity] duration-[320ms] motion-reduce:transition-none";

/** 叠放档位（0 当前）：背景牌只向下露边并收窄（不旋转：宽牌旋转后角部下坠会压住动作条）；
 * 第 3 档是藏在最底下的候补牌，翻牌时淡入补到第 2 档 */
const OFFSET_TRANSFORM = [
  "",
  "translate-y-[8px] scale-x-[0.96]",
  "translate-y-[16px] scale-x-[0.92]",
  "translate-y-[16px] scale-x-[0.92] opacity-0",
] as const;

/** 预渲染完整牌面的档数：第 1 档被当前牌盖住，提前挂好正文，顶上来时不闪 */
const FULL_DEPTH = 2;

type DeckOffset = 0 | 1 | 2 | 3;

const FLY_OUT = "-translate-x-[60%] -translate-y-[4%] -rotate-[6deg] opacity-0";

/** 牌堆地址键（kind:id，兼作「从这里继续走」的 from 参数） */
const deckItemKey = (item: WalkItem) => `${item.ref.kind}:${item.ref.id}`;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function WalkDeckPanel() {
  const { navigator } = usePage();
  const queryClient = useQueryClient();
  const { date, deck, loading } = useTodayWalkDeck();
  const [advancing, setAdvancing] = useState(false);
  const [rerolling, setRerolling] = useState(false);
  const [mutedKeys, setMutedKeys] = useState<ReadonlySet<string>>(new Set());
  // 每张牌只记一次 seen（reroll 换新牌不与旧 key 重叠，保留可防同日重复记录）
  const seenKeysRef = useRef(new Set<string>());

  const key = walkDeckKey(date);
  const items = deck?.items ?? [];
  const n = items.length;
  const cursor = Math.min(deck?.cursor ?? 0, n);
  const done = n > 0 && cursor >= n;
  const current = done ? null : (items[cursor] ?? null);

  /* 当前牌首次露出时记 seen（依赖 deck 引用而非派生数组，避免每 render 重跑） */
  useEffect(() => {
    const item = deck?.items[cursor];
    if (!item) return;
    const itemKey = deckItemKey(item);
    if (seenKeysRef.current.has(itemKey)) return;
    seenKeysRef.current.add(itemKey);
    void markRandomWalkSeen(item.ref).catch(() => undefined);
  }, [deck, cursor]);

  const commitAdvance = (next: number) => {
    setAdvancing(false);
    queryClient.setQueryData<WalkDailyDeck>(key, old => (old ? { ...old, cursor: next } : old));
    void advanceRandomWalkDailyDeck({ date, cursor: next }).catch(() => undefined);
  };

  const goNext = () => {
    if (advancing || !deck || cursor >= n) return;
    const next = cursor + 1;
    if (prefersReducedMotion()) {
      commitAdvance(next);
      return;
    }
    setAdvancing(true);
    // 稍晚于过渡结束再推进：飞走的牌播完才卸载，前移的牌已落到新档位，换档无跳变
    window.setTimeout(() => commitAdvance(next), FLIP_MS + 20);
  };

  const muteCurrent = async () => {
    const item = items[cursor];
    if (!item || advancing) return;
    try {
      await muteRandomWalk(item.ref);
    } catch {
      toast.error("屏蔽失败，稍后再试");
      return;
    }
    toast.success("这条不会再被抽到了");
    setMutedKeys(prev => new Set(prev).add(deckItemKey(item)));
    goNext();
  };

  const reroll = async () => {
    if (rerolling) return;
    setRerolling(true);
    try {
      const next = await rerollRandomWalkDailyDeck({ date });
      queryClient.setQueryData(key, next);
      setMutedKeys(new Set());
    } catch {
      toast.error("重抽失败，稍后再试");
    } finally {
      setRerolling(false);
    }
  };

  if (loading || n === 0) return null;

  return (
    <>
      <SectionHeading title="重温" className="pt-3" />
      <Panel variant="outline" pad="compact">
        <PanelTitle className="mb-2.5">
          <Footprints className="text-accent size-3.5" strokeWidth={1.75} />
          今日漫步
          <PanelNote className="tabular-nums">{done ? "已走完" : `${cursor + 1} / ${n}`}</PanelNote>
          <PanelAction onClick={() => navigator.push("walk")} title="进入漫步页">
            进入漫步页
            <ChevronRight size={13} strokeWidth={1.75} />
          </PanelAction>
        </PanelTitle>

        <div className="@max-[860px]:grid-cols-1 grid grid-cols-[minmax(0,760px)_minmax(200px,1fr)] gap-8">
          {/* 左列：牌堆 + 动作条 */}
          <div className="flex flex-col gap-3">
            <div
              tabIndex={0}
              aria-label="今日漫步牌堆"
              className="rounded-tau-lg relative mb-5 h-[248px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
              onKeyDown={e => {
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  goNext();
                }
              }}
            >
              {done ? (
                <div className="motion-safe:animate-walk-in border-line-2 text-ink-3 rounded-tau-lg absolute inset-0 flex flex-col items-center justify-center gap-2 border border-dashed text-center">
                  <Footprints className="size-6" strokeWidth={1.75} />
                  <p className="text-tau-body text-ink-1 font-medium">今天的 {n} 张走完了</p>
                  <p className="text-tau-meta text-ink-3">明天会有新的 {n} 张</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Shuffle}
                      loading={rerolling}
                      onClick={() => void reroll()}
                    >
                      再抽 5 张
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => navigator.push("walk")}>
                      去漫步页继续走
                    </Button>
                  </div>
                </div>
              ) : (
                // key 绑这一叠的首张：初次加载与重抽时整叠入场，翻牌时不重挂
                <div
                  key={items[0] ? deckItemKey(items[0]) : "empty"}
                  className="motion-safe:animate-walk-in absolute inset-0"
                >
                  {([3, 2, 1, 0] as const).map(offset => {
                    const item = items[cursor + offset];
                    if (!item) return null;
                    return (
                      <DeckCard
                        key={deckItemKey(item)}
                        item={item}
                        offset={offset}
                        advancing={advancing}
                        onOpen={offset === 0 ? () => openWalkItem(item) : undefined}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {!done && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Footprints}
                  disabled={advancing}
                  onClick={() => current && navigator.push("walk", { from: deckItemKey(current) })}
                >
                  从这里继续走
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={EyeOff}
                  disabled={advancing}
                  onClick={() => void muteCurrent()}
                >
                  别再出现
                </Button>
                <span className="flex-1" />
                <Button variant="primary" size="sm" disabled={advancing} onClick={goNext}>
                  {cursor === n - 1 ? "完成" : "下一张"}
                  {/* 键帽叠在 accent 实心按钮上：半透明 ink-inverse 底只在主按钮内成立 */}
                  <kbd className="text-tau-tiny font-tau-mono ml-1 rounded bg-[color-mix(in_srgb,var(--tau-ink-inverse)_22%,transparent)] px-1">
                    →
                  </kbd>
                </Button>
              </div>
            )}
          </div>

          {/* 右列：今日进度列表 */}
          <div className="@max-[860px]:hidden">
            <p className="text-tau-micro text-ink-3 px-2 pb-1.5">今天的 {n} 张</p>
            <ul>
              {items.map((item, index) => {
                const muted = mutedKeys.has(deckItemKey(item));
                const isCurrent = index === cursor && !done;
                const flipped = index < cursor;
                const content = (
                  <>
                    <span
                      className={cn(
                        "size-[7px] flex-none rounded-full",
                        flipped ? "bg-ink-3" : isCurrent ? "bg-accent" : "bg-line-2"
                      )}
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        flipped ? "text-ink-2" : isCurrent ? "text-ink-1 font-medium" : "text-ink-3"
                      )}
                    >
                      {item.title}
                    </span>
                    {muted && <span className="text-tau-tiny text-ink-3 ml-auto">已屏蔽</span>}
                  </>
                );
                return (
                  <li key={deckItemKey(item)}>
                    {flipped ? (
                      <button
                        type="button"
                        title="打开原文"
                        onClick={() => openWalkItem(item)}
                        className="ease-tau-out hover:bg-hover rounded-tau-sm text-tau-meta flex w-full min-w-0 items-center gap-2 px-2 py-[7px] text-left transition-[background] duration-[160ms]"
                      >
                        {content}
                      </button>
                    ) : (
                      <div
                        className={cn(
                          "rounded-tau-sm text-tau-meta flex min-w-0 items-center gap-2 px-2 py-[7px]",
                          isCurrent && "bg-hover"
                        )}
                      >
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </Panel>
    </>
  );
}

/* ---------- 域内私有组件 ---------- */

/** 牌堆里的一张牌：offset 为叠放档位（0 当前，可点击打开原文）；前两档渲染完整牌面 */
function DeckCard({
  item,
  offset,
  advancing,
  onOpen,
}: {
  item: WalkItem;
  offset: DeckOffset;
  advancing: boolean;
  onOpen?(): void;
}) {
  const kind = WALK_KIND_META[item.ref.kind];
  const KindIcon = kind.icon;
  // 牌堆项不是足迹步，via 一律视为起点（只讲选中原因，不讲岔路来处）
  const why = formatWalkWhy({ item, via: { type: "start" } });
  const WhyIcon = why.icon;
  const isPdfAnnotation = item.ref.kind === "pdf-annotation";
  const full = offset < FULL_DEPTH;
  // 翻牌时当前牌飞出，其余各自前移一档（候补牌淡入补位）
  const transform =
    offset === 0 ? (advancing ? FLY_OUT : "") : OFFSET_TRANSFORM[advancing ? offset - 1 : offset];

  const card = (
    <>
      <div className="text-tau-micro text-ink-3 flex flex-wrap items-center gap-2">
        <span className="bg-accent-soft text-accent-text inline-flex h-[22px] items-center gap-1 rounded-full px-2">
          <KindIcon className="size-3.5 shrink-0" strokeWidth={1.75} />
          {kind.label}
        </span>
        <span className="tabular-nums">写于 {dayjs(item.createTime).format("YYYY-MM-DD")}</span>
      </div>
      {full && (
        <>
          <p className="text-tau-meta text-ink-2 mt-2.5 flex items-center gap-1.5">
            <WhyIcon className="text-accent size-3.5 shrink-0" strokeWidth={1.75} />
            {why.text}
          </p>
          <p className="text-tau-body-lg text-ink-1 mb-2 mt-2.5 line-clamp-1 font-semibold">
            {item.title}
          </p>
          <div className="min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(#000_65%,transparent)]">
            {isPdfAnnotation
              ? item.excerpt && (
                  <p className="border-accent text-tau-body text-ink-1 border-l-2 pl-3">
                    {item.excerpt}
                  </p>
                )
              : item.content && <CardContentPreview content={item.content as Descendant[]} />}
          </div>
        </>
      )}
      {!full && (
        <p className="text-tau-body-lg text-ink-1 mt-2.5 line-clamp-1 font-semibold">
          {item.title}
        </p>
      )}
    </>
  );

  if (onOpen) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`打开原文：${item.title}`}
        className={cn(CARD_BASE, transform, "cursor-pointer text-left")}
        onClick={onOpen}
        onKeyDown={e => {
          if (e.key === "Enter") {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        {card}
      </div>
    );
  }
  return (
    <div aria-hidden className={cn(CARD_BASE, transform)}>
      {card}
    </div>
  );
}
