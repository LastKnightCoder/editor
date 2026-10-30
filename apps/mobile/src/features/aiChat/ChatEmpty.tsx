import { CalendarDays, KeyRound, ListChecks, NotebookPen, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { suggestionsFor } from "./suggestions";

/** 建议卡的图标与标签色，按位置轮换 */
const SUGGESTION_STYLES = [
  { Icon: CalendarDays, tone: "bg-tag-2-soft text-tag-2" },
  { Icon: ListChecks, tone: "bg-tag-1-soft text-tag-1" },
  { Icon: NotebookPen, tone: "bg-tag-3-soft text-tag-3" },
  { Icon: Sparkles, tone: "bg-tag-4-soft text-tag-4" },
];

function greeting(now = new Date()) {
  const hour = now.getHours();
  return hour < 5 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
}

export function ChatEmpty(props: { onPick(text: string): void }) {
  return (
    <div className="px-1.5 pt-8">
      <h2 className="text-ink-1 text-[24px] leading-[1.35] font-bold">
        {greeting()}，
        <br />
        <span className="text-accent-text">今天想整理点什么？</span>
      </h2>
      <p className="text-ink-2 text-tau-meta mt-1.5 leading-relaxed">
        可以问笔记里的内容，也能帮你查日程、排待办。
      </p>
      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {suggestionsFor().map((text, index) => {
          const { Icon, tone } = SUGGESTION_STYLES[index % SUGGESTION_STYLES.length];
          return (
            <button
              key={text}
              type="button"
              onClick={() => props.onPick(text)}
              className="bg-surface shadow-card text-ink-1 text-tau-body flex min-h-[92px] flex-col items-start gap-2 rounded-[18px] p-3 text-left leading-snug transition-transform active:scale-[0.98]"
            >
              <span className={`grid h-7 w-7 place-items-center rounded-[9px] ${tone}`}>
                <Icon size={15} aria-hidden="true" />
              </span>
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
