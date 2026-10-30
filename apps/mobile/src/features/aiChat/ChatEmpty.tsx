import { CalendarDays, History, KeyRound, ListChecks, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { suggestionsFor } from "./suggestions";

const SUGGESTION_ICONS = [ListChecks, CalendarDays, History];

export function ChatEmpty(props: { onPick(text: string): void }) {
  return (
    <div className="px-1 pt-10">
      <span className="bg-accent-soft text-accent-text mx-auto grid h-[72px] w-[72px] place-items-center rounded-[24px]">
        <Sparkles size={32} aria-hidden="true" />
      </span>
      <h2 className="text-ink-1 mt-4 text-center text-[18px] font-extrabold">想聊点什么？</h2>
      <p className="text-ink-2 text-tau-meta mt-1.5 text-center leading-relaxed">
        可以问笔记里的内容，也可以让我帮你整理待办和日程。
      </p>
      <div className="mt-6 grid gap-2">
        {suggestionsFor().map((text, index) => {
          const Icon = SUGGESTION_ICONS[index] ?? Sparkles;
          return (
            <button
              key={text}
              type="button"
              onClick={() => props.onPick(text)}
              className="bg-surface text-ink-1 text-tau-body flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-transform active:scale-[0.98]"
            >
              <Icon size={17} className="text-ink-3 shrink-0" aria-hidden="true" />
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 未给「对话」分配模型：入口照常可进，这里引导去设置 */
export function ChatSetup(props: { hasProvider: boolean; onSetup(): void; footer?: ReactNode }) {
  return (
    <div className="px-1 pt-10">
      <span className="bg-accent-soft text-accent-text mx-auto grid h-[72px] w-[72px] place-items-center rounded-[24px]">
        <KeyRound size={30} aria-hidden="true" />
      </span>
      <h2 className="text-ink-1 mt-4 text-center text-[18px] font-extrabold">先接一个 AI 服务</h2>
      <p className="text-ink-2 text-tau-meta mt-1.5 text-center leading-relaxed">
        {props.hasProvider
          ? "已添加服务商，还需要为「对话」选一个模型。"
          : "对话需要你自己的模型服务。填一个 API Key 就能开始，Key 只保存在这台手机上。"}
      </p>
      <button
        type="button"
        onClick={props.onSetup}
        className="bg-accent text-ink-inverse text-tau-body shadow-lift mt-6 h-12 w-full rounded-[14px] font-semibold"
      >
        {props.hasProvider ? "选择对话模型" : "添加 AI 服务商"}
      </button>
      {props.footer}
    </div>
  );
}
