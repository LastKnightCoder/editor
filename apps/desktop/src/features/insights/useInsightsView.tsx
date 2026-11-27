/**
 * 洞见视图（KL-058）：点「AI 洞见」后正文就地进入——读（报告卡位置的骨架 + 阶段说明，正文不动）→ 点亮（报告卡 + 标记依次画出）
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
import { Editor as SlateEditor, Transforms, type Editor } from "slate";
import { ReactEditor } from "slate-react";
import { Plus } from "lucide-react";
import { cn, toast } from "@tau/ui";
import { contextCount } from "@/features/context/model";
import { useEntityContext } from "@/features/context/queries";
import type { EntityRef } from "@/entity/ref";
import { useOverlayDismiss } from "@/page/PageProvider";
import {
  subscribeInsightFocus,
  takeInsightFocus,
  type InsightFocus,
} from "@/services/insight-focus";
import { discussInsight, type InsightNote } from "@/services/insight-chat";
import { useSettingsStore } from "@/app/settingsStore";
import { aiNotifyText } from "@/services/notifications/ai.i18n";
import {
  currentDatabaseName,
  isCurrentDatabase,
  isSurfaceActive,
  notifyAiTask,
  registerActiveSurface,
} from "@/services/notifications/aiNotify";
import { openEntity } from "@/services/open-content";
import type { InsightAsk, InsightKind, InsightMark } from "@/types/content-insights";
import { createInsightDecorate } from "./anchors";
import { connectInsightMark } from "./connect";
import { InsightCurrentContext, InsightLeaf } from "./components/InsightLeaf";
import { InsightPopover, primaryActionOf } from "./components/InsightPopover";
import { InsightsReport } from "./components/InsightsReport";
import { useContentInsights, useInsightsPhase } from "./queries";

import { insightsFeedback, insightsFailure } from "./i18n";

import { InsightsModeButton, InsightsWalkBar } from "./components/InsightsChrome";

type ViewState = "off" | "reading" | "on";

const EMPTY_MARKS: InsightMark[] = [];

export interface InsightsViewOptions {
  ref: EntityRef;
  contentId: number;
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
  useEffect(() => registerActiveSurface(`insights:${ref.kind}:${ref.id}`), [ref.kind, ref.id]);

  const isOnInsightsSurface = useCallback(
    () => !useSettingsStore.getState().open && isSurfaceActive(`insights:${ref.kind}:${ref.id}`),
    [ref.kind, ref.id]
  );

  const openThisEntity = useCallback(() => {
    useSettingsStore.getState().closeSettings();
    return openEntity(ref);
  }, [ref]);

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
    const dbName = currentDatabaseName();
    const title = context?.self.title;
    void analyze.mutateAsync().then(
      () => {
        setView("on");
        notifyAiTask({
          id: `content-insights:${ref.kind}:${ref.id}`,
          title: aiNotifyText("insights.contentDoneTitle"),
          body: title
            ? aiNotifyText("insights.contentDoneBody", { title })
            : aiNotifyText("insights.contentDoneUntitled"),
          source: aiNotifyText("source.insights"),
          icon: "sparkles",
          tone: "ok",
          databaseName: dbName,
          isOnSurface: isOnInsightsSurface,
          actions: [
            {
              label: aiNotifyText("action.view"),
              primary: true,
              reveal: true,
              onClick: openThisEntity,
            },
          ],
        });
      },
      error => {
        setView("off");
        const message = insightsFailure("insights.analyzeFailed", error);
        const notified = notifyAiTask({
          id: `content-insights:${ref.kind}:${ref.id}`,
          title: aiNotifyText("insights.contentFailedTitle"),
          body: message(),
          source: aiNotifyText("source.insights"),
          icon: "sparkles",
          tone: "danger",
          sticky: true,
          databaseName: dbName,
          isOnSurface: isOnInsightsSurface,
          actions: [
            {
              label: aiNotifyText("action.view"),
              primary: true,
              reveal: true,
              onClick: openThisEntity,
            },
          ],
        });
        if (!notified && isCurrentDatabase(dbName)) toast.error(message);
      }
    );
  }, [
    analyze,
    context?.self.title,
    getEditor,
    insights,
    isOnInsightsSurface,
    openThisEntity,
    ref.id,
    ref.kind,
  ]);

  const reanalyze = useCallback(() => {
    setCurrent(null);
    setWalking(false);
    setView("reading");
    const dbName = currentDatabaseName();
    const title = context?.self.title;
    void analyze.mutateAsync().then(
      () => {
        setView("on");
        notifyAiTask({
          id: `content-insights:${ref.kind}:${ref.id}`,
          title: aiNotifyText("insights.contentDoneTitle"),
          body: title
            ? aiNotifyText("insights.contentDoneBody", { title })
            : aiNotifyText("insights.contentDoneUntitled"),
          source: aiNotifyText("source.insights"),
          icon: "sparkles",
          tone: "ok",
          databaseName: dbName,
          isOnSurface: isOnInsightsSurface,
          actions: [
            {
              label: aiNotifyText("action.view"),
              primary: true,
              reveal: true,
              onClick: openThisEntity,
            },
          ],
        });
      },
      error => {
        setView("on");
        const message = insightsFailure("insights.analyzeFailed", error);
        const notified = notifyAiTask({
          id: `content-insights:${ref.kind}:${ref.id}`,
          title: aiNotifyText("insights.contentFailedTitle"),
          body: message(),
          source: aiNotifyText("source.insights"),
          icon: "sparkles",
          tone: "danger",
          sticky: true,
          databaseName: dbName,
          isOnSurface: isOnInsightsSurface,
          actions: [
            {
              label: aiNotifyText("action.view"),
              primary: true,
              reveal: true,
              onClick: openThisEntity,
            },
          ],
        });
        if (!notified && isCurrentDatabase(dbName)) toast.error(message);
      }
    );
  }, [analyze, context?.self.title, isOnInsightsSurface, openThisEntity, ref.id, ref.kind]);

  useOverlayDismiss(() => {
    if (current && !walking) setCurrent(null);
    else if (walking) {
      setWalking(false);
      setCurrent(null);
    } else exit();
  }, view !== "off");

  /* ── 动作 ── */
  const resolveTo = (mark: InsightMark | InsightAsk, status: "linked" | "dismissed") => {
    if (focus) {
      focus.onResolved(status);
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
      toast.warning(insightsFeedback("insights.anchorMissing"));
      return;
    }
    setFreshLink(mark.id);
    toast.success(insightsFeedback("insights.connected", { count: contextCount(context) + 1 }));
    resolveTo(mark, "linked");
  };

  /** 可以展开：收起洞见，光标放到那一块末尾，接着写 */
  const write = (mark: InsightMark) => {
    const editor = getEditor();
    if (!editor || !editor.children[mark.block]) {
      toast.warning(insightsFeedback("insights.blockMissing"));
      return;
    }
    resolveTo(mark, "linked");
    exit();
    requestAnimationFrame(() => {
      try {
        Transforms.select(editor, SlateEditor.end(editor, [mark.block]));
        ReactEditor.focus(editor);
      } catch {
        // 块已不在（正文刚改过）：留在原处
      }
    });
  };

  /** 矛盾与「可以继续想」：带着这篇（和对方）开一个对话，用户发出后标为已处理 */
  const discuss = (item: InsightMark | InsightAsk, prompt: string, notes: InsightNote[]) => {
    setCurrent(null);
    setWalking(false);
    const self: InsightNote = { ref, contentId, title: context?.self.title ?? "" };
    void discussInsight(prompt, [self, ...notes]).then(sent => {
      if (sent) setStatus.mutate({ itemId: item.id, status: "linked" });
    });
  };
  const discussMark = (mark: InsightMark) =>
    discuss(
      mark,
      [
        `这两处说法不一致：${mark.why}`,
        mark.mine ? `这篇：${mark.mine}` : "",
        mark.theirs && mark.target ? `《${mark.target.title}》：${mark.theirs}` : "",
        "帮我想想哪个对，或者各自成立的条件。",
      ]
        .filter(Boolean)
        .join("\n"),
      mark.target ? [mark.target] : []
    );

  const runPrimary = (mark: InsightMark) => {
    const action = primaryActionOf(mark);
    if (action === "connect") connect(mark);
    else if (action === "write") write(mark);
    else discussMark(mark);
  };

  const openTarget = (mark: InsightMark) => {
    if (!mark.target) return;
    openEntity(mark.target.ref, { at: { block: mark.target.block } }).catch(error =>
      toast.error(insightsFailure("insights.openFailed", error))
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
        runPrimary(mark);
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
          toast.warning(insightsFeedback("insights.blockMissing"));
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
    <InsightsModeButton
      view={view}
      copy={copy}
      hasOpen={hasOpen}
      toggle={() => (view === "off" ? enter() : exit())}
    />
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
        onAsk={ask => discuss(ask, ask.text, [])}
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
          onPrimary={runPrimary}
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
          <InsightsWalkBar
            index={Math.max(1, walkOrder.findIndex(item => item.id === current) + 1)}
            total={walkOrder.length}
            end={() => {
              setWalking(false);
              setCurrent(null);
            }}
          />,
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
