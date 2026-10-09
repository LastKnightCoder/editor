/**
 * 洞见视图（KL-058）：点「AI 洞见」后正文就地进入——读（扫光 + 阶段说明）→ 点亮（报告卡 + 标记依次画出）
 * → 气泡处理 / 逐条看 → 退出（再点按钮、Esc、点正文或开始输入）。
 *
 * 详情页拿到四样东西摆到自己的位置：button（元信息行）、report（正文上方）、editorProps（传给 ContentEditor）、
 * frame（包住编辑器，提供定位容器、段尾淡注、气泡与逐条看操作条）。
 * 视图里不切编辑器只读：只读会撤掉 AI 编辑上下文登记与协作在线状态；改为「点正文或开始输入即退出」，
 * 连接走正常的编辑操作。
 *
 * 从知识地图「去连接」打开时（services/insight-focus），视图只画地图带来的那一处、不显示报告卡，
 * 处理结果回写到地图那一条。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Transforms, type Editor } from "slate";
import { ReactEditor } from "slate-react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { Button, cn, toast } from "@tau/ui";
import { contextCount } from "@/features/context/model";
import { useEntityContext } from "@/features/context/queries";
import type { EntityRef } from "@/entity/ref";
import { useOverlayDismiss } from "@/page/PageProvider";
import {
  subscribeInsightFocus,
  takeInsightFocus,
  type InsightFocus,
} from "@/services/insight-focus";
import { requestQuestionCapture } from "@/services/question-capture";
import { openEntity } from "@/services/open-content";
import type { InsightAsk, InsightKind, InsightMark } from "@/types/content-insights";
import type { QuestionLinkTargetType } from "@/types/question";
import { createInsightDecorate } from "./anchors";
import { connectInsightMark } from "./connect";
import { InsightCurrentContext, InsightLeaf } from "./components/InsightLeaf";
import { InsightPopover, connectsByDefault } from "./components/InsightPopover";
import { InsightsReport } from "./components/InsightsReport";
import { useContentInsights, useInsightsPhase } from "./queries";

type ViewState = "off" | "reading" | "on";

const EMPTY_MARKS: InsightMark[] = [];

const QUESTION_TARGET: Record<EntityRef["kind"], QuestionLinkTargetType | null> = {
  card: "card",
  article: "article",
  "project-item": "project_item",
  "diary-moment": null,
};

export interface InsightsViewOptions {
  ref: EntityRef;
  contentId: number;
  /** 来源 chip 的文字：「卡片：xxx」「文章：xxx」 */
  sourceLabel: string;
  getEditor(): Editor | null | undefined;
  /** 一定进入候选的实体（创作模式：白板上的资料） */
  getSeed?(): EntityRef[];
  /** 报告卡里宿主补充的一行 */
  reportExtra?: ReactNode;
  /** 气泡里对方标题旁的宿主动作 */
  targetAction?(mark: InsightMark): ReactNode;
  /** 宿主场景下的按钮文案（创作模式：「标出可引用处」） */
  copy?: { label: string; title: string };
}

export function useInsightsView({
  ref,
  contentId,
  sourceLabel,
  getEditor: getEditorProp,
  getSeed,
  reportExtra,
  targetAction,
  copy,
}: InsightsViewOptions) {
  // 调用方未必稳定传入；用 ref 保住最新的，避免依赖它的 effect 每次渲染重跑
  const getEditorRef = useRef(getEditorProp);
  getEditorRef.current = getEditorProp;
  const getEditor = useCallback(() => getEditorRef.current(), []);
  const getSeedRef = useRef(getSeed);
  getSeedRef.current = getSeed;
  const { enabled, insights, analyze, setStatus } = useContentInsights(
    ref,
    useCallback(() => getSeedRef.current?.() ?? [], [])
  );
  const { data: context } = useEntityContext(enabled ? ref : null);
  const [view, setView] = useState<ViewState>("off");
  const [current, setCurrent] = useState<string | null>(null);
  const [walking, setWalking] = useState(false);
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  const [focus, setFocus] = useState<InsightFocus | null>(null);
  const phase = useInsightsPhase(contentId, view === "reading");
  const on = view === "on";

  const marks = useMemo(
    () => (focus ? [focus.mark] : (insights?.result.marks ?? [])),
    [focus, insights]
  );
  const openMarks = useMemo(() => marks.filter(mark => mark.status === "open"), [marks]);
  // 逐条看的顺序：画在字上的按正文顺序，可以展开排在各自那一块之后
  const walkOrder = useMemo(
    () =>
      [...openMarks].sort(
        (a, b) => a.block - b.block || (a.kind === "gap" ? 1 : 0) - (b.kind === "gap" ? 1 : 0)
      ),
    [openMarks]
  );

  const exit = useCallback(() => {
    setView("off");
    setCurrent(null);
    setWalking(false);
    setFocus(null);
  }, []);

  // 切到另一篇时收起
  useEffect(() => exit(), [ref.kind, ref.id, exit]);

  // 从知识地图「去连接」过来：只画那一处并弹出气泡
  useEffect(() => {
    const take = () => {
      const next = takeInsightFocus({ kind: ref.kind, id: ref.id });
      if (!next) return;
      setFocus(next);
      setWalking(false);
      setView("on");
      setCurrent(next.mark.id);
    };
    take();
    return subscribeInsightFocus(take);
  }, [ref.kind, ref.id]);

  const enter = useCallback(() => {
    const editor = getEditor();
    if (editor) Transforms.deselect(editor);
    if (insights) {
      setView("on");
      return;
    }
    setView("reading");
    analyze.mutate(undefined, {
      onSuccess: () => setView("on"),
      onError: error => {
        setView("off");
        toast.error(error instanceof Error ? error.message : "分析失败");
      },
    });
  }, [analyze, getEditor, insights]);

  const reanalyze = useCallback(() => {
    setCurrent(null);
    setWalking(false);
    setView("reading");
    analyze.mutate(undefined, {
      onSuccess: () => setView("on"),
      onError: error => {
        setView("on");
        toast.error(error instanceof Error ? error.message : "分析失败");
      },
    });
  }, [analyze]);

  useOverlayDismiss(() => {
    if (current && !walking) setCurrent(null);
    else if (walking) {
      setWalking(false);
      setCurrent(null);
    } else exit();
  }, view !== "off");

  /* ── 动作 ── */
  const resolveTo = (
    mark: InsightMark | InsightAsk,
    status: "linked" | "questioned" | "dismissed"
  ) => {
    if (focus) {
      if (status !== "questioned") focus.onResolved(status);
      exit();
      return;
    }
    setStatus.mutate({ itemId: mark.id, status });
    if (walking) {
      const rest = walkOrder.filter(item => item.id !== mark.id);
      const index = walkOrder.findIndex(item => item.id === mark.id);
      const next = rest[Math.min(index, rest.length - 1)];
      setCurrent(next?.id ?? null);
      if (!next) setWalking(false);
    } else setCurrent(null);
  };

  const connect = (mark: InsightMark) => {
    const editor = getEditor();
    if (!editor || !connectInsightMark(editor, mark)) {
      toast.warning("原文已经改动，找不到这几个字，可以重新分析");
      return;
    }
    setFreshLink(mark.id);
    toast.success(`已连接 · 这篇现在连着 ${contextCount(context) + 1} 处`);
    resolveTo(mark, "linked");
  };

  const question = (item: InsightMark | InsightAsk, title: string) => {
    const targetType = QUESTION_TARGET[ref.kind];
    if (targetType) {
      requestQuestionCapture({
        source: { kind: "material", target: { targetType, targetId: ref.id } },
        sourceLabel,
        defaultTitle: title,
      });
    }
    resolveTo(item, "questioned");
  };
  const questionMark = (mark: InsightMark) =>
    question(mark, mark.kind === "gap" ? mark.text : mark.why);

  const openTarget = (mark: InsightMark) => {
    if (!mark.target) return;
    openEntity(mark.target.ref, { at: { block: mark.target.block } }).catch(error =>
      toast.error(error instanceof Error ? error.message : "无法打开内容")
    );
  };

  /* ── 逐条看 ── */
  const focusMark = useCallback(
    (id: string) => {
      setCurrent(id);
      const el = frameEl?.querySelector<HTMLElement>(
        `[data-insight-mark="${id}"], [data-insight-gap="${id}"]`
      );
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [frameEl]
  );
  const startWalk = () => {
    if (!walkOrder.length) return;
    setWalking(true);
    focusMark(walkOrder[0].id);
  };
  useEffect(() => {
    if (!walking) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const index = walkOrder.findIndex(item => item.id === current);
      const mark = walkOrder[index];
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = walkOrder[(index + step + walkOrder.length) % walkOrder.length];
        if (next) focusMark(next.id);
      } else if (event.key === "Enter" && mark) {
        event.preventDefault();
        if (connectsByDefault(mark)) connect(mark);
        else questionMark(mark);
      } else if (event.key === "Backspace" && mark) {
        event.preventDefault();
        resolveTo(mark, "dismissed");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const jumpKind = (kind: InsightKind) => {
    const first = walkOrder.find(mark => mark.kind === kind);
    if (first) focusMark(first.id);
  };

  /* ── 编辑器装饰 ── */
  const decorate = useMemo(() => (on ? createInsightDecorate(marks) : undefined), [on, marks]);

  /* ── 段尾淡注：给块留出一行位置，淡注定位在块下面 ── */
  const gaps = useMemo(
    () => (on ? openMarks.filter(mark => mark.kind === "gap") : []),
    [on, openMarks]
  );
  const [gapPositions, setGapPositions] = useState<Record<string, { top: number; left: number }>>(
    {}
  );
  useEffect(() => {
    const editor = getEditor();
    if (!frameEl || !editor || !gaps.length) {
      setGapPositions(previous => (Object.keys(previous).length ? {} : previous));
      return;
    }
    const marked: HTMLElement[] = [];
    const measure = () => {
      const frame = frameEl.getBoundingClientRect();
      const next: Record<string, { top: number; left: number }> = {};
      for (const gap of gaps) {
        const node = editor.children[gap.block];
        if (!node) continue;
        try {
          const el = ReactEditor.toDOMNode(editor, node);
          if (!el.hasAttribute("data-insight-gap-block")) {
            el.setAttribute("data-insight-gap-block", "");
            marked.push(el);
          }
          const rect = el.getBoundingClientRect();
          next[gap.id] = { top: rect.bottom - frame.top + 2, left: rect.left - frame.left };
        } catch {
          // 块已不在（正文改了）：这条淡注不显示
        }
      }
      setGapPositions(next);
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(frameEl);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      marked.forEach(el => el.removeAttribute("data-insight-gap-block"));
    };
  }, [frameEl, gaps, getEditor]);

  /* ── 当前一处的气泡锚点 ── */
  const currentMark = marks.find(mark => mark.id === current && mark.status === "open") ?? null;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!currentMark || !frameEl) {
      setAnchorEl(null);
      return;
    }
    // 从别处打开过来时正文可能还在加载：多等几帧再找
    let tries = 0;
    let raf = 0;
    const find = () => {
      const el = frameEl.querySelector<HTMLElement>(
        `[data-insight-mark="${currentMark.id}"], [data-insight-gap="${currentMark.id}"]`
      );
      if (el || ++tries > 90) {
        setAnchorEl(el);
        if (el && focus) el.scrollIntoView({ block: "center" });
        if (!el) {
          toast.warning("原文已经改动，找不到这一处，可以重新分析");
          if (!walking) setCurrent(null);
        }
        return;
      }
      raf = requestAnimationFrame(find);
    };
    raf = requestAnimationFrame(find);
    return () => cancelAnimationFrame(raf);
  }, [currentMark, frameEl, gapPositions, focus, walking]);

  /* ── 渲染件 ── */
  const hasOpen = Boolean(insights && openMarks.length);
  const button = enabled ? (
    <button
      type="button"
      onClick={() => (view === "off" ? enter() : exit())}
      disabled={view === "reading"}
      title={view === "off" ? (copy?.title ?? "让 AI 对照你的其他笔记读这一篇") : "退出洞见视图"}
      className={cn(
        "text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full px-2 transition-colors",
        view !== "off" &&
          "bg-accent-soft text-accent-text hover:bg-accent-soft hover:text-accent-text"
      )}
    >
      {view === "reading" ? (
        <Loader2 className="size-[13px] animate-spin" strokeWidth={1.75} />
      ) : (
        <Sparkles className="size-[13px]" strokeWidth={1.75} />
      )}
      {view === "reading"
        ? "正在读"
        : view === "on"
          ? copy
            ? "收起标注"
            : "退出洞见"
          : (copy?.label ?? "AI 洞见")}
      {view === "off" && hasOpen && <i className="bg-accent size-[5px] rounded-full opacity-70" />}
    </button>
  ) : null;

  const report =
    view === "off" || focus ? null : (
      <InsightsReport
        insights={view === "reading" ? null : insights}
        reading={view === "reading"}
        phase={phase}
        knownLinks={contextCount(context)}
        freshLink={freshLink}
        onJumpKind={jumpKind}
        onAsk={ask => question(ask, ask.text)}
        onReanalyze={reanalyze}
        onWalk={startWalk}
        extra={reportExtra}
      />
    );

  const frame = (children: ReactNode) => (
    <div
      ref={setFrameEl}
      className={cn(
        "relative",
        // 有段尾淡注的块下面留出一行
        on && "[&_[data-insight-gap-block]]:!mb-8"
      )}
      onMouseDownCapture={event => {
        if (!on) return;
        const target = event.target as HTMLElement;
        const markEl = target.closest<HTMLElement>("[data-insight-mark], [data-insight-gap]");
        if (markEl) {
          event.preventDefault();
          const id = markEl.dataset.insightMark ?? markEl.dataset.insightGap ?? null;
          setCurrent(id === current ? null : id);
          return;
        }
        if (target.closest("[data-insight-popover]")) return;
        // 点正文即回到编辑
        exit();
      }}
      onKeyDownCapture={event => {
        // Alt+方向键让位导航、输入法组合键不算「开始输入」
        if (
          on &&
          !walking &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.nativeEvent.isComposing
        )
          exit();
      }}
    >
      {view === "reading" && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="animate-insight-sweep rounded-tau-md absolute -inset-x-6 h-24 bg-[linear-gradient(180deg,transparent,var(--tau-accent-soft)_45%,var(--tau-accent-soft)_55%,transparent)]" />
        </div>
      )}
      <InsightCurrentContext.Provider value={current}>{children}</InsightCurrentContext.Provider>
      {gaps.map(gap => {
        const at = gapPositions[gap.id];
        if (!at) return null;
        return (
          <button
            key={gap.id}
            type="button"
            data-insight-gap={gap.id}
            style={{ top: at.top, left: at.left }}
            className={cn(
              "text-ink-3 hover:text-accent-text animate-fadeIn absolute flex max-w-full items-center gap-1 truncate text-[12.5px]",
              current === gap.id && "text-accent-text"
            )}
          >
            <Plus className="size-3 shrink-0" strokeWidth={1.75} />
            {gap.text}
          </button>
        );
      })}
      {on && currentMark && (
        <InsightPopover
          mark={currentMark}
          anchor={anchorEl}
          walking={walking}
          onConnect={connect}
          onQuestion={questionMark}
          onDismiss={mark => resolveTo(mark, "dismissed")}
          onOpenTarget={openTarget}
          targetAction={targetAction}
          onClose={() => {
            setWalking(false);
            setCurrent(null);
          }}
        />
      )}
      {on &&
        walking &&
        createPortal(
          <div className="bg-surface shadow-float text-tau-meta text-ink-2 fixed bottom-6 left-1/2 z-[240] flex -translate-x-1/2 items-center gap-2.5 rounded-full py-1.5 pl-4 pr-2">
            <span className="text-ink-1 tabular-nums">
              {Math.max(1, walkOrder.findIndex(item => item.id === current) + 1)} /{" "}
              {walkOrder.length}
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
    </div>
  );

  return {
    enabled,
    view,
    /** 洞见视图打开时还没处理的标记（宿主据此在别处画对应） */
    openMarks: on ? openMarks : EMPTY_MARKS,
    current: on ? current : null,
    button,
    report,
    frame,
    editorProps: { decorate, leafWrapper: InsightLeaf },
  };
}
