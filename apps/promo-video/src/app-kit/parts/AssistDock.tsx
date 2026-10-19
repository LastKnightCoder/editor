/**
 * AI 对话停靠栏重建：结构摘自 app/AssistDock.tsx、features/chat RightChatPanel 与 packages/chat-ui MessageView / ToolCallRow，
 * 知识库搜索卡片摘自 tool-call-renderers（search_knowledge）。各段出现时机由 reveal 字典驱动（0→1）。
 */
import type { ReactNode } from "react";
import clsx from "clsx";
import { ArrowUp, Brain, Check, ChevronDown, ChevronRight, Maximize2, MoreHorizontal, PanelRightClose, Plus, ShieldCheck, SquarePen } from "lucide-react";
import { IconButton } from "@tau/ui";
import { AI_CHAT } from "../../mock/day";

export type AssistReveal = {
  /** 用户消息 */
  user: number;
  /** 第 i 个工具调用：0 未出现，(0,1) 执行中，1 完成 */
  tools: number[];
  /** 回答正文逐行出现（0→1 映射到行数） */
  answer: number;
  /** 输入框里正在打的字 */
  draft?: string;
};

export const appear = (t: number) => ({ opacity: Math.min(1, t * 1.6), transform: `translateY(${(1 - Math.min(1, t)) * 10}px)` });

export function AssistDock({ open, reveal }: { open: number; reveal: AssistReveal }) {
  const chat = AI_CHAT;
  return (
    <DockShell open={open} title={chat.title} model={chat.model} draft={reveal.draft}>
      {reveal.user > 0 && <UserBubble text={chat.ask} t={reveal.user} />}
      <div className="pt-2 pb-2">
        <div className="text-tau-body-lg text-ink-1 flex w-full min-w-0 flex-col items-start">
          <div className="my-1.5 flex w-full flex-col gap-0.5">
            {chat.tools.map((tool, i) => {
              const t = reveal.tools[i] ?? 0;
              if (t <= 0) return null;
              if (tool.kind === "search" && t >= 1) return <SearchCard key={i} style={appear(1)} />;
              return <ToolRow key={i} name={tool.name} done={t >= 1} note={tool.note} style={appear(Math.min(1, t * 4))} />;
            })}
          </div>
          {reveal.answer > 0 && <Answer progress={reveal.answer} />}
        </div>
      </div>
    </DockShell>
  );
}

export function UserBubble({ text, t }: { text: string; t: number }) {
  return (
    <div className="pt-3 pb-2" style={appear(t)}>
      <div className="flex flex-col items-end gap-1">
        <div className="bg-accent/[0.18] text-tau-body-lg text-ink-1 max-w-[82%] rounded-[14px_14px_4px_14px] px-3.5 py-2">{text}</div>
      </div>
    </div>
  );
}

/** 停靠栏外壳：标题栏 + 消息区（children）+ 输入框；open 0→1 展开宽度 */
export function DockShell({ open, title, model, draft, children }: { open: number; title: string; model: string; draft?: string; children: ReactNode }) {
  return (
    <aside
      className="bg-surface rounded-tau-lg shadow-card relative mr-[18px] mb-[18px] flex min-h-0 flex-none flex-col overflow-hidden"
      style={{ width: 400 * open, opacity: Math.min(1, open * 1.5), marginRight: 18 * open }}
    >
      <div className="flex min-h-0 w-[400px] flex-1 flex-col">
        <div className="flex h-11 flex-none items-center gap-0.5 pr-2 pl-3">
          <span className="text-tau-body text-ink-1 -ml-1 flex min-w-0 items-center gap-1 rounded-[8px] px-1.5 py-1 font-semibold">
            {title}
            <ChevronDown size={14} strokeWidth={1.75} className="text-ink-3 shrink-0" />
          </span>
          <span className="flex-1" />
          <IconButton className="size-7">
            <MoreHorizontal size={16} strokeWidth={1.75} />
          </IconButton>
          <IconButton className="size-7">
            <SquarePen size={15} strokeWidth={1.75} />
          </IconButton>
          <IconButton className="size-7">
            <Maximize2 size={15} strokeWidth={1.75} />
          </IconButton>
          <IconButton className="size-7">
            <PanelRightClose size={16} strokeWidth={1.75} />
          </IconButton>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden pr-2.5 pl-5">{children}</div>

        <div className="box-border flex-none px-5 pt-2 pb-3">
          <div className="border-line-1 bg-surface relative rounded-[16px] border pt-3 pr-2.5 pb-2.5 pl-3.5">
            <div className="text-tau-body-lg min-h-[22px] px-0.5">
              {draft ? (
                <span>
                  {draft}
                  <i className="bg-accent ml-px inline-block h-[1.1em] w-[1.5px] translate-y-[3px]" />
                </span>
              ) : (
                <span className="text-ink-3">输入消息，Command + Enter 进行发送</span>
              )}
            </div>
            <div className="mt-2.5 flex items-center gap-1">
              <span className="border-line-1 text-ink-2 grid size-[30px] place-items-center rounded-[10px] border">
                <Plus size={16} strokeWidth={1.75} />
              </span>
              <span className="text-ink-2 grid size-[30px] place-items-center">
                <ShieldCheck size={15} strokeWidth={1.75} />
              </span>
              <span className="flex-1" />
              <span className="text-tau-body text-ink-1 flex h-[30px] items-center gap-1 rounded-[9px] pr-1.5 pl-2">
                {model}
                <ChevronDown size={12} strokeWidth={1.75} className="text-ink-3" />
              </span>
              <span className="text-tau-body text-ink-1 flex h-[30px] items-center gap-1 rounded-[9px] pr-1.5 pl-2">
                <Brain size={15} strokeWidth={1.75} className="text-ink-2" />
                细致
              </span>
              <span data-hit="send" className={clsx("ml-1 grid size-[30px] place-items-center rounded-[10px]", draft ? "bg-accent text-ink-inverse" : "bg-hover text-ink-3")}>
                <ArrowUp size={16} strokeWidth={2.25} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function ToolRow({ name, done, note, style }: { name: string; done: boolean; note: string; style?: React.CSSProperties }) {
  return (
    <div style={style} className="text-tau-meta text-ink-2 -ml-1.5 flex h-[26px] max-w-full items-center gap-1.5 rounded-[7px] pr-2 pl-1.5 leading-none">
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        {done ? <Check className="text-ok size-3.5" strokeWidth={2} /> : <i className="border-accent/30 border-t-accent inline-block size-3 animate-none rounded-full border-[1.5px]" />}
      </span>
      <span className="font-tau-mono text-[12px]">{name}</span>
      <span className="text-ink-3 tabular-nums">· {done ? note : "执行中…"}</span>
      <ChevronRight size={13} strokeWidth={1.75} className="text-ink-3" />
    </div>
  );
}

function SearchCard({ style }: { style?: React.CSSProperties }) {
  const results = AI_CHAT.results;
  return (
    <div style={style} className="border-line-1 bg-surface rounded-tau-md my-2 w-full max-w-full min-w-0 overflow-hidden border">
      <div className="px-3.5 pt-3 pb-1">
        <div className="text-tau-body text-ink-1 font-semibold">知识库搜索结果</div>
        <div className="text-tau-sm text-ink-3">共 {results.length} 条结果</div>
      </div>
      <div className="space-y-1.5 px-3.5 pt-2 pb-3.5">
        {results.map(r => (
          <div key={r.title} className="border-line-1 rounded-tau-sm border px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-tau-body text-ink-1 min-w-0 flex-1 truncate font-medium">{r.title}</span>
              <span className="bg-hover text-ink-2 text-tau-tiny inline-flex rounded-full px-2 py-0.5 font-medium">{r.kind}</span>
            </div>
            <div className="text-tau-sm text-ink-3 mt-0.5">{r.when}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Answer({ progress }: { progress: number }) {
  const lines: ReactNode[] = [
    <p key="p" className="my-2 first:mt-0">
      {AI_CHAT.answerLead}
    </p>,
    <h3 key="h" className="text-tau-title mt-4 mb-1.5 font-semibold">
      {AI_CHAT.outlineTitle}
    </h3>,
    ...AI_CHAT.outline.map((item, i) => (
      <div key={`o${i}`} className="my-1 flex gap-2 pl-1">
        <span className="text-ink-3 tabular-nums">{i + 1}.</span>
        <span>
          <b className="text-ink-1 font-semibold">{item.head}</b>
          <span className="text-ink-2">——{item.body}</span>
        </span>
      </div>
    )),
    <p key="tail" className="text-ink-2 my-2">
      {AI_CHAT.answerTail}
    </p>,
  ];
  const shown = progress * lines.length;
  return (
    <div className="w-full">
      {lines.map((line, i) => (
        <div key={i} style={appear(Math.max(0, Math.min(1, shown - i)))}>
          {shown > i ? line : null}
        </div>
      ))}
    </div>
  );
}
