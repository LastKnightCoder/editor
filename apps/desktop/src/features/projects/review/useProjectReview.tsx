/**
 * 项目回顾（KL-004 / KL-065）：项目名右边「✦ 回顾」（归档的项目叫「结项回顾」）。
 * 点开后右侧当前文档上方展开报告卡；生长回顾里「可能属于这里」的笔记以虚线行长进文档树那一支，
 * 「还薄」是那一支下面的淡注；点一行出气泡，最多两个按钮。再点按钮或 Esc 收起。
 * 没写过回顾时点按钮立即写一次；打开即记为看过（今日卡与按钮上的小点随之消失）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, CornerDownRight, CircleHelp } from "lucide-react";
import { AnchoredPanel, Button, cn, toast } from "@tau/ui";
import { addChildProjectItem } from "@/commands";
import { useOverlayDismiss, usePage } from "@/page/PageProvider";
import { openEntity } from "@/services/open-content";
import { requestQuestionCapture } from "@/services/question-capture";
import { EProjectItemType, type ProjectItem } from "@/types";
import type { InsightAsk } from "@/types/content-insights";
import type { QuestionLinkTarget } from "@/types/question";
import type { KnowledgeEndpoint, KnowledgeMark } from "@/types/knowledge-insights";
import { defaultProjectItemEventBus } from "@/utils";
import { ProjectReviewReport } from "./ProjectReviewReport";
import type { ProjectReviewTree } from "./ProjectReviewContext";
import { useProjectReviewData } from "./reviewQueries";

type ViewState = "off" | "reading" | "on";

export function useProjectReview(options: {
  projectId: number;
  projectTitle: string;
  archived: boolean;
  /** 打开时就展开（今日页「打开回顾」） */
  autoOpen: boolean;
}) {
  const { projectId, projectTitle, archived, autoOpen } = options;
  const { enabled, data, review, setStatus, markSeen } = useProjectReviewData(projectId);
  const { navigator } = usePage();
  const [view, setView] = useState<ViewState>("off");
  const [current, setCurrent] = useState<{ mark: KnowledgeMark; element: HTMLElement } | null>(
    null
  );
  const [fresh, setFresh] = useState(false);
  const on = view === "on";

  const seenIfNeeded = useCallback(
    (node: { id: number; updateTime: number; result: { seenAt?: number } } | null) => {
      if (node && !(node.result.seenAt && node.result.seenAt >= node.updateTime)) markSeen(node.id);
    },
    [markSeen]
  );

  const write = useCallback(() => {
    setCurrent(null);
    setView("reading");
    review.mutate(undefined, {
      onSuccess: node => {
        setView("on");
        seenIfNeeded(node);
      },
      onError: error => {
        setView(data ? "on" : "off");
        toast.error(error instanceof Error ? error.message : "回顾失败");
      },
    });
  }, [data, review, seenIfNeeded]);

  const enter = useCallback(() => {
    setFresh(false);
    // 项目刚归档、手里还是生长回顾时，重新写成结项回顾
    if (data && !(archived && data.reviewKind !== "final")) {
      setView("on");
      seenIfNeeded(data);
      return;
    }
    write();
  }, [archived, data, seenIfNeeded, write]);

  const exit = useCallback(() => {
    setView("off");
    setCurrent(null);
  }, []);

  // 换项目时收起
  useEffect(() => exit(), [projectId, exit]);

  const autoOpened = useRef(false);
  useEffect(() => {
    if (!autoOpen || autoOpened.current || !enabled || review.isPending) return;
    autoOpened.current = true;
    enter();
  }, [autoOpen, enabled, enter, review.isPending]);

  useOverlayDismiss(() => {
    if (current) setCurrent(null);
    else exit();
  }, view !== "off");

  /* ── 动作 ── */
  const resolveTo = (itemId: string, status: "linked" | "questioned" | "dismissed") => {
    if (data) setStatus.mutate({ nodeId: data.id, itemId, status });
    setCurrent(null);
  };

  const open = (end: KnowledgeEndpoint) => {
    openEntity(end.ref, { at: { block: end.block } }).catch(error =>
      toast.error(error instanceof Error ? error.message : "无法打开内容")
    );
  };

  /** 在那一支下加一个引用型条目（不复制、不移动） */
  const reference = async (mark: KnowledgeMark) => {
    const end = mark.ends[0];
    if (!end || mark.under === undefined) return;
    if (end.ref.kind !== "card" && end.ref.kind !== "article") return;
    try {
      const [parent] = await addChildProjectItem(mark.under, {
        title: end.title,
        content: [],
        count: 0,
        children: [],
        refType: end.ref.kind,
        refId: end.ref.id,
        projectItemType: EProjectItemType.Document,
        whiteBoardContentId: 0,
      } as never);
      if (parent) {
        defaultProjectItemEventBus
          .createEditor()
          .publishProjectItemEvent("project-item:updated", parent as ProjectItem);
      }
      setFresh(true);
      toast.success(`已引用《${end.title}》`);
      resolveTo(mark.id, "linked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "引用失败");
    }
  };

  const questionThin = (mark: KnowledgeMark) => {
    requestQuestionCapture({
      source: { kind: "none" },
      sourceLabel: `项目：${projectTitle}`,
      defaultTitle: (mark.text ?? "").replace(/^这里还薄[:：]\s*/, ""),
    });
    resolveTo(mark.id, "questioned");
  };

  const askQuestion = (ask: InsightAsk) => {
    // 结项回顾的问题挂上核心观点那几篇；没有就只记来源文字
    const targetType = {
      card: "card",
      article: "article",
      "project-item": "project_item",
    } as const;
    const targets: QuestionLinkTarget[] = (data?.result.refs ?? []).flatMap(end =>
      end.ref.kind in targetType
        ? [
            {
              targetType: targetType[end.ref.kind as keyof typeof targetType],
              targetId: end.ref.id,
            },
          ]
        : []
    );
    requestQuestionCapture({
      source: targets.length ? { kind: "materials", targets } : { kind: "none" },
      sourceLabel: `项目：${projectTitle}`,
      defaultTitle: ask.text,
    });
    resolveTo(ask.id, "questioned");
  };

  /* ── 文档树 ── */
  const marksByBranch = useMemo(() => {
    const map = new Map<number, KnowledgeMark[]>();
    if (!on || !data) return map;
    for (const mark of data.result.marks) {
      if (mark.status !== "open" || mark.under === undefined) continue;
      map.set(mark.under, [...(map.get(mark.under) ?? []), mark]);
    }
    return map;
  }, [on, data]);

  const unseen = Boolean(
    data?.result.lead && !(data.result.seenAt && data.result.seenAt >= data.updateTime)
  );
  const button = enabled ? (
    <button
      type="button"
      onClick={() => (view === "off" ? enter() : exit())}
      disabled={view === "reading"}
      title={view === "off" ? "看看这个项目最近长了什么" : "收起回顾"}
      className={cn(
        "text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 inline-flex h-[24px] shrink-0 items-center gap-[5px] rounded-full px-2 transition-colors",
        view !== "off" &&
          "bg-accent-soft text-accent-text hover:bg-accent-soft hover:text-accent-text"
      )}
    >
      {view === "reading" ? (
        <Loader2 className="size-[13px] animate-spin" strokeWidth={1.75} />
      ) : (
        <Sparkles className="size-[13px]" strokeWidth={1.75} />
      )}
      {view === "on" ? "收起回顾" : archived ? "结项回顾" : "回顾"}
      {view === "off" && unseen && <i className="bg-accent size-[5px] rounded-full opacity-75" />}
    </button>
  ) : null;

  const tree: ProjectReviewTree = {
    button,
    marksUnder: itemId => marksByBranch.get(itemId) ?? [],
    current: current?.mark.id ?? null,
    onPick: (mark, element) =>
      setCurrent(previous => (previous?.mark.id === mark.id ? null : { mark, element })),
  };

  const report =
    view === "off" ? null : (
      <ProjectReviewReport
        node={view === "reading" ? null : data}
        reading={view === "reading"}
        archived={archived}
        fresh={fresh}
        onOpen={open}
        onOpenProject={id => navigator.push("project-detail", { id })}
        onAsk={askQuestion}
        onReview={write}
      />
    );

  const mark = current?.mark;
  const popover =
    on && mark ? (
      <AnchoredPanel
        anchor={current.element}
        placement="right-start"
        className="w-[340px] max-w-[340px]"
      >
        <div
          data-review-popover
          className="text-tau-body text-ink-1 px-3.5 pb-2.5 pt-3 leading-[1.7]"
          onMouseDown={event => event.stopPropagation()}
        >
          <div className="text-ink-3 mb-1 flex items-center gap-1.5 text-[11.5px]">
            <i
              className={cn(
                "size-[7px] rounded-full",
                mark.kind === "belong" ? "bg-accent" : "bg-ink-3"
              )}
            />
            {mark.kind === "belong" ? "可能属于这里" : "还薄"}
          </div>
          {mark.kind === "thin" && mark.text && <p className="font-medium">{mark.text}</p>}
          <p className={cn(mark.kind === "thin" && "text-ink-2 text-tau-meta")}>{mark.why}</p>
          {mark.kind === "belong" && mark.ends[0] && (
            <button
              type="button"
              onClick={() => open(mark.ends[0])}
              className="bg-surface-hover rounded-tau-sm hover:bg-hover text-tau-meta mt-2 block w-full px-2.5 py-2 text-left leading-[1.65]"
            >
              <span className="text-ink-1 block truncate font-medium">
                《{mark.ends[0].title}》
              </span>
              {mark.ends[0].excerpt && (
                <span className="text-ink-2 line-clamp-3 block">{mark.ends[0].excerpt}</span>
              )}
            </button>
          )}
          <div className="mt-2.5 flex items-center gap-1.5">
            {mark.kind === "belong" ? (
              <Button
                size="sm"
                variant="primary"
                icon={CornerDownRight}
                onClick={() => void reference(mark)}
              >
                引用到这里
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                icon={CircleHelp}
                onClick={() => questionThin(mark)}
              >
                记为问题
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => resolveTo(mark.id, "dismissed")}>
              不相关
            </Button>
          </div>
        </div>
      </AnchoredPanel>
    ) : null;

  return { enabled, view, tree, report, popover };
}
