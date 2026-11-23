/**
 * 视频笔记里停靠的对话栏（第三栏），结构摘自 components/VideoNotePanel/VideoNoteChatPanel 与 ChatInputArea / MessageView / ToolCallRow。
 * 新对话是空态「问问这个视频」+ 建议提问（点了直接发送）；之后是一轮轮问答，每轮回答前先有工具行（在字幕里检索、读一段转录）。
 * 从字幕「问 AI」进来时，原句显示在输入框上方（「视频 12:43」+ 原句），下面是三个快捷提问；点了是填进输入框，不直接发送。
 * 各段出现的时机由调用方给（0→1）。
 */
import type { ReactNode } from "react";
import clsx from "clsx";
import { ArrowUp, Brain, ChevronDown, PanelRightClose, Plus, ShieldCheck, SquarePen, X } from "lucide-react";
import { IconButton } from "@tau/ui";
import { appear, ToolRow } from "./AssistDock";
import { Pressed } from "./Dialog";
import { CHAT, NOTE, type ChatExchange } from "../../mock/videonote";
import { AI_CHAT } from "../../mock/day";
import { transcriptTime } from "./TranscriptList";

const CHIP = "text-tau-body text-ink-1 ease-tau-out flex h-[30px] min-w-0 max-w-[120px] shrink items-center gap-1 rounded-[9px] pr-1.5 pl-2";

/** 回答里的一段：**粗体** 染主墨色；shown 是这一段已流出的比例 */
function AnswerText({ text, shown }: { text: string; shown: number }) {
  const parts = text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map(part => ({ bold: /^\*\*[^*]+\*\*$/.test(part), chars: [...part.replace(/\*\*/g, "")] }));
  let left = Math.floor(parts.reduce((n, part) => n + part.chars.length, 0) * shown);
  return (
    <>
      {parts.map((part, i) => {
        if (left <= 0) return null;
        const visible = part.chars.slice(0, left).join("");
        left -= part.chars.length;
        return part.bold ? (
          <strong key={i} className="text-ink-1 font-semibold">
            {visible}
          </strong>
        ) : (
          <span key={i}>{visible}</span>
        );
      })}
    </>
  );
}

/** 对话里的一轮：各段出现的进度由调用方给 */
export type ChatTurn = {
  exchange: ChatExchange;
  /** 用户消息出现 0→1 */
  user: number;
  /** 每个工具调用：0 未出现，(0,1) 执行中，1 完成 */
  tools: number[];
  /** 回答：0→1 映射到各段依次流出 */
  answer: number;
};

function Turn({ turn, index }: { turn: ChatTurn; index: number }) {
  const { exchange, user, tools, answer } = turn;
  if (user <= 0) return null;
  const paragraphs = exchange.answer.length;
  return (
    <div className="pt-3">
      <div className="flex flex-col items-end gap-1" style={appear(user)}>
        <div className="bg-accent/[0.18] text-tau-body-lg text-ink-1 max-w-[92%] rounded-[14px_14px_4px_14px] px-3.5 py-2 [overflow-wrap:anywhere]">
          {exchange.quote && (
            <blockquote className="border-line-1 text-ink-2 my-1 border-l-2 pl-3.5">
              <p className="my-0.5">视频 {transcriptTime(exchange.quote.time * 1000)}</p>
              <p className="my-0.5">{exchange.quote.text}</p>
            </blockquote>
          )}
          <p className={clsx("last:mb-0", exchange.quote ? "mt-2" : "my-0")}>{exchange.prompt}</p>
        </div>
      </div>
      {tools.some(t => t > 0) && (
        <div className="text-tau-body-lg text-ink-1 flex w-full min-w-0 flex-col items-start pt-3">
          <div data-hit={`chat-tools:${index}`} className="my-1.5 flex flex-col gap-0.5">
            {exchange.tools.map((tool, i) => (tools[i] ?? 0) > 0 && <ToolRow key={tool.name} name={tool.name} done={tools[i] >= 1} note={tool.note} style={appear(Math.min(1, tools[i] * 4))} />)}
          </div>
          {answer > 0 && (
            <div data-hit={`chat-answer:${index}`} className="w-full">
              {exchange.answer.map((text, i) => {
                // 每段依次流出：前一段写完才轮到下一段
                const local = Math.max(0, Math.min(1, answer * paragraphs - i));
                if (local <= 0) return null;
                return (
                  <p key={i} className="my-2 first:mt-0 last:mb-0">
                    <AnswerText text={text} shown={local} />
                  </p>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function VideoNoteChat({
  turns = [],
  quote,
  quoteAt = 0,
  input = "",
  caret,
  pressedAsk,
  pressedSend,
  pressedPrompt,
}: {
  /** 已发出的各轮；一轮都没有时是空态（建议提问） */
  turns?: ChatTurn[];
  /** 从字幕带进来、还没发出的原句（秒 + 文字） */
  quote?: { time: number; text: string };
  quoteAt?: number;
  /** 输入框里已打出的字 */
  input?: string;
  caret?: boolean;
  pressedAsk?: number;
  pressedSend?: boolean;
  pressedPrompt?: number;
}) {
  const sent = turns.filter(turn => turn.user > 0);
  const empty = sent.length === 0;
  return (
    <div className="box-border flex h-full min-h-0 min-w-0 flex-col px-3 pb-3">
      <div className="flex h-[52px] shrink-0 items-center gap-1">
        <div className="min-w-0 flex-1">
          <span className="hover:bg-hover aria-expanded:bg-hover text-tau-body text-ink-1 ease-tau-out -ml-1 flex max-w-full min-w-0 items-center gap-1 rounded-[8px] px-1.5 py-1 font-semibold">
            <span className="min-w-0 truncate">新对话</span>
            <ChevronDown size={14} strokeWidth={1.75} className="text-ink-3 shrink-0" />
          </span>
        </div>
        <IconButton className="size-7">
          <SquarePen size={15} strokeWidth={1.75} />
        </IconButton>
        <IconButton className="size-7">
          <PanelRightClose size={15} strokeWidth={1.75} />
        </IconButton>
      </div>

      {/* 消息贴着底边往上长：新内容总在输入框上方（真实对话跟随到底部） */}
      <div className="relative flex min-h-0 flex-1 flex-col justify-end overflow-hidden pr-2.5 pl-5">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center px-6 pb-10 text-center">
            <h2 className="text-tau-title text-ink-1 font-semibold">问问这个视频</h2>
            <div className="mt-4 flex w-full max-w-[320px] flex-col gap-2">
              {CHAT.prompts.map((prompt, i) => (
                <span key={prompt} data-hit={`chat-prompt:${i}`}>
                  <Pressed on={pressedPrompt === i}>
                    <button type="button" className="border-line-1 text-tau-meta text-ink-2 hover:bg-hover rounded-tau-sm w-full border px-3 py-2 text-left">
                      {prompt}
                    </button>
                  </Pressed>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex shrink-0 flex-col pb-2">
            {turns.map((turn, i) => (
              <Turn key={i} turn={turn} index={i} />
            ))}
          </div>
        )}
      </div>

      <div className="box-border flex-none px-5 pt-2 pb-3">
        <div className="border-line-1 bg-surface ease-tau-out focus-within:border-accent relative rounded-[16px] border pt-3 pr-2.5 pb-2.5 pl-3.5 focus-within:shadow-[var(--tau-focus-ring)]">
          {quote && quoteAt > 0 && (
            <div className="mb-2 flex flex-col gap-1.5" style={{ opacity: quoteAt, transform: `translateY(${(1 - quoteAt) * 4}px)` }}>
              <div className="bg-surface border-line-1 rounded-tau-md flex items-start gap-2 border px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-tau-meta text-ink-3 tabular-nums">视频 {transcriptTime(quote.time * 1000)}</div>
                  <div className="text-tau-sm text-ink-2 line-clamp-2">{quote.text}</div>
                </div>
                <IconButton className="-mt-0.5 -mr-1 size-6">
                  <X size={13} strokeWidth={1.75} />
                </IconButton>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {NOTE.asks.map((ask, i) => (
                  <span key={ask} data-hit={`ask:${i}`}>
                    <Pressed on={pressedAsk === i}>
                      <button type="button" className="border-line-1 text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 ease-tau-out h-6 rounded-full border px-2.5">
                        {ask}
                      </button>
                    </Pressed>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div data-hit="chat-input" className="text-tau-body-lg min-h-[22px] px-0.5">
            {input || (!quote && <span className="text-ink-3">输入消息，Command + Enter 进行发送</span>)}
            {caret && <i className="bg-accent ml-px inline-block h-[1.1em] w-[1.5px] translate-y-[3px]" />}
          </div>
          <div className="mt-2.5 flex items-center gap-1">
            <span className="border-line-1 text-ink-2 grid size-[30px] shrink-0 place-items-center rounded-[10px] border">
              <Plus size={16} strokeWidth={1.75} />
            </span>
            <span className={CHIP}>
              <ShieldCheck size={15} strokeWidth={1.75} className="text-ink-2" />
              <ChevronDown size={12} strokeWidth={1.75} className="text-ink-3" />
            </span>
            <span className="min-w-1 flex-1" />
            <span className={clsx(CHIP, "max-w-[200px]")}>
              <span className="min-w-0 truncate font-medium">{AI_CHAT.model}</span>
              <ChevronDown size={12} strokeWidth={1.75} className="text-ink-3" />
            </span>
            <span className={CHIP}>
              <Brain size={15} strokeWidth={1.75} className="text-ink-2" />
              <span className="min-w-0 truncate">细致</span>
              <ChevronDown size={12} strokeWidth={1.75} className="text-ink-3" />
            </span>
            <span data-hit="send">
              <Pressed on={!!pressedSend}>
                <span className={clsx("ease-tau-out relative ml-1 grid size-[30px] shrink-0 place-items-center rounded-[10px]", input ? "bg-accent text-ink-inverse" : "bg-hover text-ink-3")}>
                  <ArrowUp size={16} strokeWidth={2.25} />
                </span>
              </Pressed>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 对话栏第三栏的外框：左侧一条分隔线（VideoNoteView 里停靠时的样子） */
export function ChatColumn({ children, open = 1 }: { children: ReactNode; open?: number }) {
  return (
    <div className="relative flex min-h-0 min-w-0 shrink-0 flex-col shadow-[inset_1px_0_0_var(--tau-line-2)]" style={{ width: 480 * open, opacity: Math.min(1, open * 2), overflow: "hidden" }}>
      {/* 展开时内容按最终宽度排版、被外框裁开，不会挤成一列竖字 */}
      <div className="flex h-full min-h-0 w-[480px] flex-col">{children}</div>
    </div>
  );
}
