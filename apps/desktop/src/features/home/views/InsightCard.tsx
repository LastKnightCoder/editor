/**
 * 今日页「继续」段的第一块：「✦ 洞见」列表。每条直接展开：标题一句话（关键的几个字画线）+ 类型 / 范围 / 时间，
 * 一段理由，证据（问过的原话打开那次对话；涉及的笔记打开到命中位置，矛盾时并排两边说法），
 * 两个按钮：去看看（打开地图并点亮那一处 / 打开项目回顾）、不相关（回顾是「知道了」）。
 * 默认露前两条，其余收在「还有 N 条」后面；什么都没有时整块不出现。
 */

import { useState } from "react";
import {
  ChevronDown,
  FileText,
  Flag,
  FolderOpen,
  Lightbulb,
  Link2,
  Map as MapIcon,
  MessageCircle,
  MessageCircleQuestion,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button, Panel, PanelNote, PanelTitle, cn } from "@tau/ui";
import { usePage } from "@/page/PageProvider";
import { openEntity } from "@/services/open-content";
import type { KnowledgeEndpoint } from "@/types/knowledge-insights";
import { relativeDay } from "@/features/questions/model";
import { useTodayInsights } from "../insightQueries";
import type { TodayInsight, TodayInsightKind } from "../insightItems";

/** 默认露出的条数 */
const VISIBLE_COUNT = 2;

const TONE: Record<
  TodayInsightKind,
  { icon: LucideIcon; tile: string; label: string; underline: string; rail: string }
> = {
  bridge: {
    icon: Link2,
    tile: "bg-info-soft text-info",
    label: "text-info",
    underline: "bg-[linear-gradient(var(--tau-info),var(--tau-info))]",
    rail: "hover:shadow-[inset_2px_0_0_var(--tau-info)]",
  },
  asked: {
    icon: MessageCircleQuestion,
    tile: "bg-warn-soft text-warn",
    label: "text-warn",
    underline: "bg-[linear-gradient(var(--tau-warn),var(--tau-warn))]",
    rail: "hover:shadow-[inset_2px_0_0_var(--tau-warn)]",
  },
  topic: {
    icon: Lightbulb,
    tile: "bg-hover text-ink-2",
    label: "text-ink-2",
    underline: "bg-[linear-gradient(var(--tau-ink-3),var(--tau-ink-3))]",
    rail: "hover:shadow-[inset_2px_0_0_var(--tau-ink-3)]",
  },
  review: {
    icon: Flag,
    tile: "bg-accent-soft text-accent-text",
    label: "text-accent-text",
    underline: "bg-[linear-gradient(var(--tau-accent),var(--tau-accent))]",
    rail: "hover:shadow-[inset_2px_0_0_var(--tau-accent)]",
  },
};

const EVIDENCE_ROW =
  "rounded-r-tau-sm text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 " +
  "flex w-full min-w-0 items-baseline gap-2 py-1 pl-2.5 pr-2 text-left " +
  "shadow-[inset_2px_0_0_var(--tau-line-1)] ease-tau-out transition-[background,color,box-shadow] duration-[160ms]";

const shortDay = (time: number) => {
  const date = new Date(time);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

export function InsightCard() {
  const { items, dismiss } = useTodayInsights();
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;
  const shown = expanded ? items : items.slice(0, VISIBLE_COUNT);
  const hidden = items.length - VISIBLE_COUNT;

  return (
    <Panel variant="outline" pad="compact" data-today-insight>
      <PanelTitle className="mb-1.5">
        <Sparkles className="text-accent size-3.5" strokeWidth={1.75} />
        洞见
        <PanelNote>{items.length} 条新发现</PanelNote>
      </PanelTitle>
      <ul className="-mx-2 flex flex-col gap-2">
        {shown.map(item => (
          <InsightRow key={item.key} item={item} onDismiss={() => dismiss(item)} />
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm -ml-2 mt-1 inline-flex items-center gap-1 px-2 py-1"
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
            strokeWidth={1.75}
          />
          {expanded ? "收起" : `还有 ${hidden} 条`}
        </button>
      )}
    </Panel>
  );
}

function InsightRow({ item, onDismiss }: { item: TodayInsight; onDismiss(): void }) {
  const { navigator } = usePage();
  const tone = TONE[item.kind];
  const Icon = tone.icon;
  const go = () => {
    if (item.open.page === "knowledge-map") {
      navigator.push("knowledge-map", { insight: item.open.insight });
    } else {
      navigator.push("project-detail", { id: item.open.projectId, review: "1" });
    }
  };
  const openEnd = (end: KnowledgeEndpoint) =>
    void openEntity(end.ref, { at: { block: end.block } }).catch(() => undefined);
  const evidence = item.evidence;
  const claims = evidence.type === "ends" ? evidence.claims : undefined;

  return (
    <li className="animate-fadeIn grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-2 py-2">
      <span className={cn("rounded-tau-sm grid size-[30px] place-items-center", tone.tile)}>
        <Icon className="size-[15px]" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2.5">
          <p className="text-ink-1 min-w-0 flex-1 text-[14px] font-medium leading-[1.65]">
            {item.before}
            <em
              className={cn(
                "animate-insight-draw bg-[length:100%_2px] bg-bottom bg-no-repeat not-italic",
                tone.underline
              )}
            >
              {item.em}
            </em>
            {item.after}
          </p>
          <span className={cn("text-tau-micro shrink-0 font-medium", tone.label)}>
            {item.label}
          </span>
          <span className="text-tau-micro text-ink-3 shrink-0 tabular-nums">
            {item.scope} · {relativeDay(item.time, Date.now())}
          </span>
        </div>
        {item.desc && <p className="text-tau-meta text-ink-2 mt-0.5 leading-[1.65]">{item.desc}</p>}

        {evidence.type === "prompts" && evidence.prompts.length > 0 && (
          <div className="mt-2 flex flex-col gap-0.5">
            {evidence.prompts.map(prompt => (
              <button
                key={prompt.messageId}
                type="button"
                title="打开这次对话"
                onClick={() => navigator.push("chat", { id: prompt.sessionId })}
                className={cn(EVIDENCE_ROW, tone.rail)}
              >
                <MessageCircle
                  className="text-ink-3 size-3 shrink-0 self-center"
                  strokeWidth={1.75}
                />
                <span className="text-ink-3 shrink-0 tabular-nums">{shortDay(prompt.time)}</span>
                <span className="min-w-0 truncate">{prompt.text}</span>
              </button>
            ))}
          </div>
        )}

        {evidence.type === "ends" && claims && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {evidence.ends.map((end, index) => (
              <button
                key={index}
                type="button"
                title="打开到这一处"
                onClick={() => openEnd(end)}
                className={cn(EVIDENCE_ROW, "flex-col items-start gap-0.5 py-1.5", tone.rail)}
              >
                <span className="text-ink-1 max-w-full truncate font-medium">《{end.title}》</span>
                <span className="line-clamp-2">{claims[index]}</span>
              </button>
            ))}
          </div>
        )}

        {evidence.type === "ends" && !claims && evidence.ends.length > 0 && (
          <div className="mt-2 flex flex-col gap-0.5">
            {evidence.ends.map((end, index) => (
              <button
                key={index}
                type="button"
                title="打开到这一处"
                onClick={() => openEnd(end)}
                className={cn(EVIDENCE_ROW, tone.rail)}
              >
                <FileText className="text-ink-3 size-3 shrink-0 self-center" strokeWidth={1.75} />
                <span className="text-ink-1 shrink-0 font-medium">《{end.title}》</span>
                <span className="min-w-0 truncate">{end.excerpt}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-2 flex gap-1.5">
          <Button
            size="sm"
            variant="soft"
            icon={item.open.page === "knowledge-map" ? MapIcon : FolderOpen}
            onClick={go}
          >
            {item.action}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title={item.kind === "review" ? undefined : "这一处不成立，以后重新分析也不再出现"}
            onClick={onDismiss}
          >
            {item.kind === "review" ? "知道了" : "不相关"}
          </Button>
        </div>
      </div>
    </li>
  );
}
