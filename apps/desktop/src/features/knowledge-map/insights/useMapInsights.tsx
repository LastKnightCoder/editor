/**
 * 知识地图的洞见视图（KL-060）：点「✦ AI 洞见」→ 读（扫光 + 真实阶段说明）→ 点亮（报告卡 + 地图上依次画出）
 * → 点有发现的主题名飞进主题层 → 气泡处理 / 逐条看 → Esc 按层退出（气泡 → 逐条看 → 回到全局 → 退出）。
 *
 * 地图页拿到几样东西摆到自己的位置：button（标题行）、report（地图右侧的侧栏）、overlay（交给 LinkGraph）、
 * overlayRef（LinkGraph 回传坐标换算）、floating（气泡与逐条看操作条）。
 * 结果由后台按变化量生成；分析过就直接点亮，第一次（还没有全局结果）或「重新分析」时才调用。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Sparkles } from "lucide-react";
import { Button, cn, toast } from "@tau/ui";
import type { GraphOverlayApi } from "@/components/LinkGraph";
import { linkCardsMutually, setKnowledgeInsightStatus } from "@/commands/knowledge-insights";
import type { KnowledgeMapTopic } from "@/knowledge-map/types";
import { useOverlayDismiss } from "@/page/PageProvider";
import { requestInsightFocus } from "@/services/insight-focus";
import { openEntity } from "@/services/open-content";
import { startPatternCard } from "@/services/pattern-card";
import { requestQuestionCapture } from "@/services/question-capture";
import type { InsightAsk } from "@/types/content-insights";
import type {
  KnowledgeEndpoint,
  KnowledgeMark,
  KnowledgeMarkKind,
} from "@/types/knowledge-insights";
import { useKnowledgeInsights, useKnowledgeInsightsPhase } from "../insightsQueries";
import { MapInsightPopover } from "./MapInsightPopover";
import { MapInsightsOverlay } from "./MapInsightsOverlay";
import { MapInsightsReport } from "./MapInsightsReport";
import {
  bothCards,
  connectTarget,
  endpointKey,
  focusMarkOf,
  hasUnseen,
  nodeOfLevel,
  openMarks,
  parseInsightParam,
  primaryAction,
  questionDraft,
  findingTopicList,
  visibleMarks,
  walkOrder,
  type MapLevel,
} from "./model";

type ViewState = "off" | "reading" | "on";
const GLOBAL: MapLevel = { kind: "global" };
/** 镜头飞进主题后再开始画，免得标记在飞行途中被拉着走 */
const LEVEL_SWITCH_DELAY_MS = 450;

/** 地图页提供给洞见视图的能力 */
export interface MapInsightsHost {
  /** 气泡里点某篇笔记：交给地图页预览（Drawer）；「去连接」仍直接打开那篇 */
  preview(end: KnowledgeEndpoint): void;
  /** 这篇笔记在哪（卡片 / 文章 / 项目文档 · 项目名）；不在地图上返回 null */
  placeOf(end: KnowledgeEndpoint): string | null;
}

export function useMapInsights(
  topics: KnowledgeMapTopic[],
  initial: string | undefined,
  host: MapInsightsHost
) {
  const { enabled, data, analyze, setStatus } = useKnowledgeInsights();
  const [api, setApi] = useState<GraphOverlayApi | null>(null);
  const [view, setView] = useState<ViewState>("off");
  const [level, setLevel] = useState<MapLevel>(GLOBAL);
  const [current, setCurrent] = useState<string | null>(null);
  const [walking, setWalking] = useState(false);
  const [revealKey, setRevealKey] = useState(0);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const levelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phase = useKnowledgeInsightsPhase(view === "reading");
  const on = view === "on";

  const topicByLabel = useMemo(() => {
    const byLabel = new Map(
      topics.filter(topic => topic.parent === -1).map(topic => [topic.label, topic.id])
    );
    return (label: string) => byLabel.get(label) ?? null;
  }, [topics]);

  const node = nodeOfLevel(data, level);
  const marks = useMemo(() => visibleMarks(node), [node]);
  const order = useMemo(() => walkOrder(openMarks(node)), [node]);
  const findingTopics = useMemo(() => findingTopicList(data), [data]);
  const topicLabel =
    level.kind === "topic"
      ? (data?.topics.find(topic => topic.topicId === level.topicId)?.label ?? "")
      : null;

  useEffect(
    () => () => {
      if (levelTimer.current) clearTimeout(levelTimer.current);
    },
    []
  );

  const switchLevel = useCallback(
    (next: MapLevel) => {
      setCurrent(null);
      setWalking(false);
      if (levelTimer.current) clearTimeout(levelTimer.current);
      if (next.kind === "topic") api?.flyToTopic(next.topicId);
      else api?.flyToAll();
      levelTimer.current = setTimeout(() => {
        setLevel(next);
        setRevealKey(key => key + 1);
      }, LEVEL_SWITCH_DELAY_MS);
    },
    [api]
  );

  const run = useCallback(() => {
    setCurrent(null);
    setWalking(false);
    setView("reading");
    analyze.mutate(undefined, {
      onSuccess: () => {
        setView("on");
        setRevealKey(key => key + 1);
      },
      onError: error => {
        setView(data?.global ? "on" : "off");
        toast.error(error instanceof Error ? error.message : "分析失败");
      },
    });
  }, [analyze, data]);

  const enter = useCallback(() => {
    setLevel(GLOBAL);
    if (data?.global) {
      setView("on");
      setRevealKey(key => key + 1);
      return;
    }
    run();
  }, [data, run]);

  const exit = useCallback(() => {
    if (level.kind === "topic") api?.flyToAll();
    if (levelTimer.current) clearTimeout(levelTimer.current);
    setView("off");
    setLevel(GLOBAL);
    setCurrent(null);
    setWalking(false);
  }, [api, level]);

  useOverlayDismiss(() => {
    if (current && !walking) setCurrent(null);
    else if (walking) {
      setWalking(false);
      setCurrent(null);
    } else if (level.kind === "topic") switchLevel(GLOBAL);
    else exit();
  }, view !== "off");

  // 选中一处时镜头让涉及的笔记都进入视口（已经都在就不动）
  useEffect(() => {
    if (!api || !current) return;
    const mark = marks.find(item => item.id === current);
    if (mark?.ends.length) api.flyToItems(mark.ends.map(endpointKey));
  }, [api, current, marks]);

  // 带着 insight 参数进来（今日页「去看看」）：直接点亮那一处；同一个参数只处理一次
  const handledParam = useRef<string | null>(null);
  useEffect(() => {
    if (!initial || handledParam.current === initial || !data?.global || !api) return;
    const target = parseInsightParam(initial);
    handledParam.current = initial;
    if (!target) return;
    if (levelTimer.current) clearTimeout(levelTimer.current);
    setWalking(false);
    setView("on");
    if (target.level.kind === "topic") {
      setCurrent(null);
      api.flyToTopic(target.level.topicId);
      const next = target.level;
      levelTimer.current = setTimeout(() => {
        setLevel(next);
        setRevealKey(key => key + 1);
        setCurrent(target.markId);
      }, LEVEL_SWITCH_DELAY_MS);
    } else {
      setLevel(GLOBAL);
      setRevealKey(key => key + 1);
      setCurrent(target.markId);
    }
  }, [initial, data, api]);

  /* ── 动作 ── */
  const resolveTo = (itemId: string, status: "linked" | "questioned" | "dismissed") => {
    if (node) setStatus.mutate({ nodeId: node.id, itemId, status });
    if (walking) {
      const rest = order.filter(item => item.id !== itemId);
      const index = order.findIndex(item => item.id === itemId);
      const next = rest[Math.min(index, rest.length - 1)];
      setCurrent(next?.id ?? null);
      if (!next) setWalking(false);
    } else setCurrent(null);
  };

  const open = (end: KnowledgeEndpoint) => {
    openEntity(end.ref, { at: { block: end.block } }).catch(error =>
      toast.error(error instanceof Error ? error.message : "无法打开内容")
    );
  };

  const connect = (mark: KnowledgeMark) => {
    if (bothCards(mark)) {
      const [a, b] = mark.ends;
      linkCardsMutually(a.ref.id, b.ref.id)
        .then(() => {
          toast.success(`已连接《${a.title}》与《${b.title}》`);
          resolveTo(mark.id, "linked");
        })
        .catch(error => toast.error(error instanceof Error ? error.message : "连接失败"));
      return;
    }
    // 有一端是长文：到那篇里、只画这一处，在那几个字上连（content-link），结果回写到这一条
    const target = connectTarget(mark);
    if (!target) return;
    const focusMark = focusMarkOf(mark, target);
    const nodeId = node?.id;
    if (focusMark && nodeId !== undefined) {
      requestInsightFocus({
        ref: target.ref,
        mark: focusMark,
        onResolved: status => {
          setKnowledgeInsightStatus(nodeId, mark.id, status).catch(() => undefined);
        },
      });
    }
    open(target);
  };

  // 状态由主进程随建卡一起记为已连接，撤回空卡片时回到未处理；去写卡片了，逐条看一并结束
  const write = (mark: KnowledgeMark) => {
    if (!node) return;
    startPatternCard(node.id, mark)
      .then(() => {
        setWalking(false);
        setCurrent(null);
      })
      .catch(error => toast.error(error instanceof Error ? error.message : "新建卡片失败"));
  };

  const question = (mark: KnowledgeMark) => {
    requestQuestionCapture(questionDraft(mark, topicLabel ?? "知识地图"));
    resolveTo(mark.id, "questioned");
  };

  const askQuestion = (ask: InsightAsk) => {
    requestQuestionCapture({
      source: { kind: "none" },
      sourceLabel: topicLabel ? `主题：${topicLabel}` : "知识地图",
      defaultTitle: ask.text,
    });
    resolveTo(ask.id, "questioned");
  };

  const jumpKind = (kind: KnowledgeMarkKind) => {
    const first = order.find(mark => mark.kind === kind);
    if (first) setCurrent(first.id);
  };

  /* ── 逐条看 ── */
  const startWalk = () => {
    if (!order.length) return;
    setWalking(true);
    setCurrent(order[0].id);
  };
  useEffect(() => {
    if (!walking) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const index = order.findIndex(item => item.id === current);
      const mark = order[index];
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = order[(index + step + order.length) % order.length];
        if (next) setCurrent(next.id);
      } else if (event.key === "Enter" && mark) {
        event.preventDefault();
        const action = primaryAction(mark);
        if (action === "connect") connect(mark);
        else if (action === "write") write(mark);
        else question(mark);
      } else if (event.key === "Backspace" && mark) {
        event.preventDefault();
        resolveTo(mark.id, "dismissed");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ── 渲染件 ── */
  const unseen = hasUnseen(data);
  const button = enabled ? (
    <button
      type="button"
      onClick={() => (view === "off" ? enter() : exit())}
      disabled={view === "reading"}
      title={view === "off" ? "让 AI 读一遍你的知识版图" : "退出洞见"}
      className={cn(
        "text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 inline-flex h-[26px] shrink-0 items-center gap-[5px] rounded-full px-2.5 transition-colors",
        view !== "off" &&
          "bg-accent-soft text-accent-text hover:bg-accent-soft hover:text-accent-text"
      )}
    >
      {view === "reading" ? (
        <Loader2 className="size-[13px] animate-spin" strokeWidth={1.75} />
      ) : (
        <Sparkles className="size-[13px]" strokeWidth={1.75} />
      )}
      {view === "reading" ? "正在读" : view === "on" ? "退出洞见" : "AI 洞见"}
      {view === "off" && unseen && <i className="bg-accent size-[5px] rounded-full opacity-75" />}
    </button>
  ) : null;

  const report =
    view === "off" ? null : (
      <MapInsightsReport
        node={view === "reading" ? null : node}
        reading={view === "reading"}
        phase={phase}
        topicLabel={topicLabel}
        findingTopics={findingTopics}
        currentTopicId={level.kind === "topic" ? level.topicId : null}
        onBack={() => switchLevel(GLOBAL)}
        onJumpKind={jumpKind}
        onPickTopic={topicId => switchLevel({ kind: "topic", topicId })}
        onAsk={askQuestion}
        onReanalyze={run}
        onWalk={startWalk}
      />
    );

  const overlay =
    view === "off" ? null : (
      <>
        {view === "reading" && (
          <div className="absolute inset-0 overflow-hidden" aria-hidden>
            <div className="animate-insight-sweep-x absolute inset-y-0 w-40 bg-[linear-gradient(90deg,transparent,var(--tau-accent-soft)_45%,var(--tau-accent-soft)_55%,transparent)]" />
          </div>
        )}
        {on && api && (
          <MapInsightsOverlay
            api={api}
            marks={marks}
            topicId={level.kind === "topic" ? level.topicId : null}
            topicByLabel={topicByLabel}
            topics={level.kind === "global" ? findingTopics : []}
            current={current}
            revealKey={revealKey}
            onPick={id => setCurrent(previous => (previous === id ? null : id))}
            onPickTopic={topicId => switchLevel({ kind: "topic", topicId })}
            onAnchor={setAnchor}
          />
        )}
      </>
    );

  const currentMark = marks.find(mark => mark.id === current && mark.status === "open") ?? null;
  const floating = on ? (
    <>
      {currentMark && (
        <MapInsightPopover
          mark={currentMark}
          anchor={anchor}
          walking={walking}
          onConnect={connect}
          onQuestion={question}
          onWrite={write}
          onDismiss={mark => resolveTo(mark.id, "dismissed")}
          onOpen={host.preview}
          placeOf={host.placeOf}
          onClose={() => {
            setWalking(false);
            setCurrent(null);
          }}
        />
      )}
      {walking &&
        createPortal(
          <div className="bg-surface shadow-float text-tau-meta text-ink-2 fixed bottom-6 left-1/2 z-[240] flex -translate-x-1/2 items-center gap-2.5 rounded-full py-1.5 pl-4 pr-2">
            <span className="text-ink-1 tabular-nums">
              {Math.max(1, order.findIndex(item => item.id === current) + 1)} / {order.length}
            </span>
            <span className="text-ink-3 text-[11px]">
              ↑↓ 切换 · 回车 处理 · ⌫ 不相关 · Esc 结束
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setWalking(false);
                setCurrent(null);
              }}
            >
              结束
            </Button>
          </div>,
          document.body
        )}
    </>
  ) : null;

  return { enabled, view, button, report, overlay, overlayRef: setApi, floating };
}
