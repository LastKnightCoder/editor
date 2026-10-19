/**
 * Notebook 详情重建：结构摘自 features/vibe-learning/views/VibeLearningView（目录 TreeRow / TreeGroupHeader、
 * 阅读区 StageHeader + MarkdownReader + 底部「基于这份资料」、右侧停靠的 ChatPanel），消息样式摘自 packages/chat-ui MessageView。
 * Notebook 对话没有引用角标。
 */
import type { CSSProperties } from "react";
import clsx from "clsx";
import {
  ArrowUp,
  Brain,
  ChevronDown,
  CircleHelp,
  FileText,
  Highlighter,
  ListOrdered,
  MessageCircle,
  MoreHorizontal,
  Network,
  NotebookPen,
  Plus,
  ShieldCheck,
  SquarePen,
  X,
  type LucideIcon,
} from "lucide-react";
import { NOTEBOOK } from "../../mock/deepwork";

export type NotebookState = {
  /** 新资料（来自摘录的那句划线）滑进目录 0→1 */
  added: number;
  /** 用户提问出现 0→1 */
  ask: number;
  /** 回答逐字流出 0→1 */
  answer: number;
};

const appear = (t: number): CSSProperties => ({ opacity: Math.min(1, t * 1.6), transform: `translateY(${(1 - Math.min(1, t)) * 8}px)` });

function GroupHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex h-[30px] items-center gap-1 pr-1 pl-1">
      <span className="text-tau-sm text-ink-2 flex min-w-0 flex-1 items-center gap-1 font-semibold">
        <ChevronDown className="text-ink-3 size-3.5 shrink-0" strokeWidth={1.75} />
        {title}
        <span className="text-ink-3 font-normal tabular-nums">{count}</span>
      </span>
      <span className="text-ink-2 grid size-[24px] place-items-center">
        <Plus className="size-[15px]" strokeWidth={1.75} />
      </span>
    </div>
  );
}

function Row({ icon: Icon, title, active, style }: { icon: LucideIcon; title: string; active?: boolean; style?: CSSProperties }) {
  return (
    <div className={clsx("text-tau-meta relative flex h-[30px] items-center gap-2 rounded-[7px] pr-1 pl-2", active ? "bg-selected text-ink-1" : "text-ink-2")} style={style}>
      <span className={clsx("grid shrink-0 place-items-center", active ? "text-ink-2" : "text-ink-3")}>
        <Icon className="size-[15px]" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
    </div>
  );
}

const QUICK: { label: string; icon: LucideIcon }[] = [
  { label: "学习大纲", icon: ListOrdered },
  { label: "重点提炼", icon: Highlighter },
  { label: "思维导图", icon: Network },
  { label: "测验", icon: CircleHelp },
];

export function NotebookPage({ state }: { state: NotebookState }) {
  const N = NOTEBOOK;
  const answerChars = [...N.answer];
  const shown = answerChars.slice(0, Math.round(answerChars.length * state.answer)).join("");
  return (
    <div className="flex h-full min-h-0 w-full flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg relative flex min-h-0 flex-1 overflow-hidden">
        {/* 目录 */}
        <div className="border-line-2 w-[256px] shrink-0 border-r py-3 pr-1 pl-2.5">
          <GroupHeader title="资料" count={N.sources.length + (state.added > 0 ? 1 : 0)} />
          <div className="flex flex-col gap-px">
            {state.added > 0 && (
              <div style={{ height: 31 * Math.min(1, state.added * 1.5), overflow: "hidden" }}>
                <Row
                  icon={Highlighter}
                  title={N.excerpt.title}
                  active
                  style={{ ...appear(state.added), background: `color-mix(in srgb, var(--tau-accent-soft) ${(1 - state.added) * 100}%, var(--tau-bg-selected))` }}
                />
              </div>
            )}
            {N.sources.map(source => (
              <Row key={source.title} icon={source.kind === "note" ? NotebookPen : FileText} title={source.title} active={state.added <= 0 && source.title === N.sources[0].title} />
            ))}
          </div>
          <div className="h-3" />
          <GroupHeader title="产物" count={N.outputs.length} />
          <div className="flex flex-col gap-px">
            <Row icon={ListOrdered} title={N.outputs[0]} />
            <Row icon={Network} title={N.outputs[1]} />
          </div>
        </div>

        {/* 阅读区：打开新收进来的摘录 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[52px] shrink-0 items-center gap-2 pr-3 pl-5">
            <span className="text-ink-2 grid shrink-0 place-items-center">
              <Highlighter className="size-4" strokeWidth={1.75} />
            </span>
            <div className="text-tau-body min-w-0 truncate font-semibold">{N.excerpt.title}</div>
            <span className="text-tau-sm text-ink-3 shrink-0 whitespace-nowrap">来自摘录</span>
            <span className="flex-1" />
            <span className="bg-selected text-accent-text grid size-[30px] place-items-center rounded-[8px]">
              <MessageCircle size={16} strokeWidth={1.75} />
            </span>
            <span className="text-ink-2 grid size-[30px] place-items-center">
              <X size={16} strokeWidth={1.75} />
            </span>
          </div>
          <div className="text-tau-body-lg text-ink-1 mx-auto min-h-0 w-full max-w-[760px] flex-1 px-10 pt-2 pb-16 leading-[1.85]">
            {N.excerpt.quotes.map(q => (
              <blockquote key={q} className="border-accent mb-4 border-l-2 pl-4">
                {q}
              </blockquote>
            ))}
            <p className="text-ink-3 text-[12.5px]">{N.excerpt.source}</p>
          </div>
          <div className="flex shrink-0 items-center justify-center gap-1 px-4 pt-2 pb-3">
            <span className="text-tau-sm text-ink-3 mr-1 whitespace-nowrap">基于这份资料</span>
            {QUICK.map(q => (
              <span key={q.label} className="text-tau-meta text-ink-2 inline-flex h-[28px] items-center gap-[6px] rounded-[10px] px-[10px] font-[550] whitespace-nowrap">
                <q.icon className="size-4" strokeWidth={1.75} />
                {q.label}
              </span>
            ))}
            <span className="text-ink-2 grid size-[28px] place-items-center">
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </span>
          </div>
        </div>

        {/* 对话（停靠，默认 480） */}
        <div className="relative flex min-h-0 w-[480px] shrink-0 flex-col shadow-[inset_1px_0_0_var(--tau-line-2)]">
          <div className="box-border flex h-full flex-col px-3 pb-3">
            <div className="flex h-[52px] shrink-0 items-center gap-1">
              <span className="text-tau-body text-ink-1 flex items-center gap-1 rounded-[8px] px-1.5 py-1 font-semibold">
                新对话
                <ChevronDown size={14} strokeWidth={1.75} className="text-ink-3" />
              </span>
              <span className="flex-1" />
              <span className="text-ink-2 grid size-7 place-items-center">
                <SquarePen size={15} strokeWidth={1.75} />
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-2">
              {state.ask > 0 && (
                <div className="flex flex-col items-end gap-1 pt-2 pb-3" style={appear(state.ask)}>
                  <div className="bg-accent/[0.18] text-tau-body-lg text-ink-1 max-w-[82%] rounded-[14px_14px_4px_14px] px-3.5 py-2">{N.ask}</div>
                </div>
              )}
              {state.answer > 0 && (
                <div className="flex min-w-0 flex-col items-start">
                  <div className="text-tau-body-lg text-ink-1 w-full min-w-0 leading-[1.75]">
                    <p className="my-2 first:mt-0">{shown}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="border-line-1 bg-surface relative rounded-[16px] border pt-3 pr-2.5 pb-2.5 pl-3.5">
              <div className="text-tau-body-lg text-ink-3 min-h-[22px]">输入消息，Command + Enter 进行发送</div>
              <div className="mt-2.5 flex items-center gap-1">
                <span className="border-line-1 text-ink-2 grid size-[30px] place-items-center rounded-[10px] border">
                  <Plus size={16} strokeWidth={1.75} />
                </span>
                <span className="text-ink-2 grid size-[30px] place-items-center">
                  <ShieldCheck size={15} strokeWidth={1.75} />
                </span>
                <span className="flex-1" />
                <span className="text-tau-body text-ink-1 flex h-[30px] items-center gap-1 rounded-[9px] pr-1.5 pl-2">
                  <Brain size={15} strokeWidth={1.75} className="text-ink-2" />
                  细致
                </span>
                <span className="bg-hover text-ink-3 ml-1 grid size-[30px] place-items-center rounded-[10px]">
                  <ArrowUp size={16} strokeWidth={2.25} />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
