/**
 * 漫步页视图：随机抽一条旧内容重温，顺着岔路走到相邻内容。
 * 足迹保存在页面本地状态（Activity 保活，返回时仍在）；起点走 react-query（from 定位
 * 或随机抽），之后的每一步（岔路 / 随机跳 / 屏蔽后跳转）直接调命令写回足迹。
 * 键位（本页在栈顶、无修饰键、不在输入框、无闪卡弹窗时）：Space 随机跳、←/→ 足迹回退/前进。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Descendant } from "slate";
import { Footprints } from "lucide-react";
import { usePage, usePageParams } from "@/page/PageProvider";
import { Button, Loading, isEditableTarget, toast } from "@tau/ui";
import {
  getRandomWalkItem,
  markRandomWalkSeen,
  muteRandomWalk,
  pickRandomWalk,
} from "@/commands/random-walk";
import useFlashcardCreation from "@/features/flashcards/hooks/useFlashcardCreation";
import { flashcardCreationRequests } from "@/services/flashcard-creation";
import type { WalkItem, WalkNeighbor, WalkRefKind } from "@/types";
import { openWalkItem } from "../open";
import { WalkCard } from "../components/WalkCard";
import { WalkForks } from "../components/WalkForks";
import { WalkPoolPicker } from "../components/WalkPoolPicker";
import { WalkTrailBar } from "../components/WalkTrail";
import { WALK_KIND_ORDER } from "../model";
import { readWalkPrefs, saveWalkPrefs, type WalkPrefs } from "../prefs";
import { useWalkNeighbors } from "../queries";
import {
  advanceTrail,
  backTrail,
  forwardTrail,
  gotoTrail,
  startTrail,
  type WalkTrail,
  type WalkVia,
} from "../trail";

const PAGE_KEY = "walk";
/** 随机跳时排除足迹中最近走过的条数 */
const JUMP_EXCLUDE_MAX = 20;

/** from 参数（kind:id）解析为地址；格式无效返回 null */
function parseFromRef(raw: string | undefined): { kind: WalkRefKind; id: number } | null {
  if (!raw) return null;
  const [kind, idText] = raw.split(":");
  const id = Number(idText);
  if (!kind || !Number.isSafeInteger(id) || id <= 0) return null;
  return (WALK_KIND_ORDER as string[]).includes(kind) ? { kind: kind as WalkRefKind, id } : null;
}

export function WalkView() {
  const { navigator } = usePage();
  const params = usePageParams<{ from?: string }>();

  const [prefs, setPrefs] = useState<WalkPrefs>(readWalkPrefs);
  const [trail, setTrail] = useState<WalkTrail | null>(null);
  const [jumping, setJumping] = useState(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const changePrefs = (next: WalkPrefs) => {
    // 同步 ref：放宽范围后立即 refetch 也要用新偏好
    prefsRef.current = next;
    setPrefs(next);
    saveWalkPrefs(next);
  };

  /* 起点查询：有 from 走 get（null 回退 pick）；staleTime Infinity，偏好变化不重查起点 */
  const startFrom = params.from ?? "random";
  const startQuery = useQuery({
    queryKey: ["walk", "start", startFrom],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<WalkItem | null> => {
      const from = parseFromRef(params.from);
      if (from) {
        const item = await getRandomWalkItem(from).catch(() => null);
        if (item) return item;
      }
      return pickRandomWalk({ bias: prefsRef.current.bias, kinds: prefsRef.current.kinds });
    },
  });

  /* 起点数据到达 / from 变化：以该条为新起点重开足迹并记 seen */
  const startedFromRef = useRef<string | null>(null);
  useEffect(() => {
    const item = startQuery.data;
    if (!item) return;
    if (trail && startedFromRef.current === startFrom) return;
    startedFromRef.current = startFrom;
    setTrail(startTrail(item));
    void markRandomWalkSeen(item.ref).catch(() => undefined);
  }, [startQuery.data, startFrom, trail]);

  const current = trail ? trail.steps[trail.index] : null;
  const currentItem = current?.item ?? null;

  const trailRefs = useMemo(() => (trail ? trail.steps.map(step => step.item.ref) : []), [trail]);
  const { neighbors, loading: neighborsLoading } = useWalkNeighbors(currentItem, trailRefs);

  const advance = (item: WalkItem, via: WalkVia) => {
    setTrail(state => (state ? advanceTrail(state, { item, via }) : state));
    void markRandomWalkSeen(item.ref).catch(() => undefined);
  };

  const jump = async () => {
    if (!trail || jumping) return;
    setJumping(true);
    try {
      const exclude = trail.steps.slice(-JUMP_EXCLUDE_MAX).map(step => step.item.ref);
      const item = await pickRandomWalk({
        bias: prefsRef.current.bias,
        kinds: prefsRef.current.kinds,
        exclude,
      });
      if (!item) {
        toast.info("没有更多可以走的内容了");
        return;
      }
      advance(item, { type: "jump" });
    } catch {
      toast.error("随机跳转失败，稍后再试");
    } finally {
      setJumping(false);
    }
  };

  const goNeighbor = async (neighbor: WalkNeighbor) => {
    if (!currentItem) return;
    try {
      const item = await getRandomWalkItem(neighbor.ref);
      if (!item) {
        toast.info("这条内容已经不在了");
        return;
      }
      advance(item, {
        type: "relation",
        relation: neighbor.relation,
        sharedTag: neighbor.sharedTag,
        fromTitle: currentItem.title,
      });
    } catch {
      toast.info("这条内容已经不在了");
    }
  };

  const muteCurrent = async () => {
    if (!currentItem) return;
    try {
      await muteRandomWalk(currentItem.ref);
    } catch {
      toast.error("屏蔽失败，稍后再试");
      return;
    }
    toast.success("这条不会再被抽到了");
    void jump();
  };

  const openSource = () => {
    if (currentItem) openWalkItem(currentItem);
  };

  /* 做成闪卡（PDF 批注不显示入口）：闪卡引用指向当前正文 */
  const flashcard = useFlashcardCreation({
    getContent: () => (currentItem?.content ?? []) as Descendant[],
    getReference: () => ({
      refType: "content" as const,
      contentId: currentItem?.contentId ?? 0,
      title: currentItem?.title || "漫步参考",
    }),
  });

  /* 键位：Space 随机跳、←/→ 足迹回退/前进（本页在栈顶，浮层与输入框让位） */
  const keyHandlers = useRef({ jump, trail });
  keyHandlers.current = { jump, trail };
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      const h = keyHandlers.current;
      if (
        flashcardCreationRequests.getSnapshot() ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        e.isComposing
      )
        return;
      if (navigator.current()?.key !== PAGE_KEY || isEditableTarget(e.target)) return;
      if (e.key === " ") {
        e.preventDefault();
        void h.jump();
      } else if (e.key === "ArrowLeft") {
        setTrail(state => (state ? backTrail(state) : state));
      } else if (e.key === "ArrowRight") {
        setTrail(state => (state ? forwardTrail(state) : state));
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [navigator]);

  const widenRange = () => {
    changePrefs({ ...prefsRef.current, kinds: [...WALK_KIND_ORDER] });
    void startQuery.refetch();
  };

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      <div className="bg-surface shadow-card rounded-tau-lg @container flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* 头部：标题 + 偏好选择器 */}
        <div className="flex flex-none items-end gap-3 px-8 pt-5">
          <div>
            <h1 className="text-tau-title-lg font-semibold tracking-[-0.01em]">漫步</h1>
            <p className="text-tau-sm text-ink-2">从你写过的东西里随便走走</p>
          </div>
          <div className="ml-auto">
            <WalkPoolPicker prefs={prefs} onChange={changePrefs} />
          </div>
        </div>

        {startQuery.isPending || !trail || !current ? (
          <div className="grid min-h-0 flex-1 place-items-center px-8 pb-6 pt-3">
            {startQuery.isPending ? (
              <Loading minHeight={0} />
            ) : startQuery.data === null ? (
              <EmptyWalk
                fullRange={prefs.kinds.length >= WALK_KIND_ORDER.length}
                onWiden={widenRange}
              />
            ) : null}
          </div>
        ) : (
          <>
            <WalkTrailBar
              trail={trail}
              onGoto={index => setTrail(state => (state ? gotoTrail(state, index) : state))}
            />
            {/* 窄屏上下布局时外层整体滚动，内边距放在内层，滚到底仍保留底边距；
                滚动条居中于内容与纸边之间（14 + 4 + 14 = px-8） */}
            <div className="@max-[900px]:overflow-y-auto @max-[900px]:border-r-[14px] @max-[900px]:border-r-transparent min-h-0 flex-1">
              <div className="@max-[900px]:h-auto @max-[900px]:grid-cols-1 @max-[900px]:pr-[14px] grid h-full grid-cols-[minmax(0,1fr)_272px] gap-5 px-8 pb-6 pt-3">
                <WalkCard
                  step={current}
                  stepKey={`${current.item.ref.kind}:${current.item.ref.id}:${trail.index}`}
                  onOpenSource={openSource}
                  onMute={() => void muteCurrent()}
                  onMakeFlashcard={flashcard.openAiFlashcard}
                />
                <WalkForks
                  neighbors={neighbors}
                  loading={neighborsLoading}
                  jumping={jumping}
                  onPick={neighbor => void goNeighbor(neighbor)}
                  onJump={() => void jump()}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyWalk({ fullRange, onWiden }: { fullRange: boolean; onWiden(): void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center">
      <Footprints className="text-ink-3 size-8" strokeWidth={1.75} />
      <p className="text-tau-body text-ink-1 font-medium">
        {fullRange ? "还没有可以漫步的内容" : "当前范围里没有内容"}
      </p>
      {fullRange ? (
        <p className="text-tau-meta text-ink-3">
          写下 30 字以上的卡片、文章或日记后，这里就有路可走了
        </p>
      ) : (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onWiden}>
          放宽到全部内容
        </Button>
      )}
    </div>
  );
}
