import { useWorkspaceI18n } from "./workspace.i18n";
import { useAskI18n } from "./askI18n";
import { CalendarDays, KeyRound, ListChecks, NotebookPen, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { suggestionsFor, suggestionPrompt } from "./suggestions";

/** 建议卡的图标与标签色，按位置轮换 */
const SUGGESTION_STYLES = [
  { Icon: CalendarDays, tone: "bg-tag-2-soft text-tag-2" },
  { Icon: ListChecks, tone: "bg-tag-1-soft text-tag-1" },
  { Icon: NotebookPen, tone: "bg-tag-3-soft text-tag-3" },
  { Icon: Sparkles, tone: "bg-tag-4-soft text-tag-4" },
];

function greetingKey(now = new Date()) {
  const hour = now.getHours();
  return hour < 5
    ? "empty.night"
    : hour < 12
      ? "empty.morning"
      : hour < 18
        ? "empty.afternoon"
        : "empty.evening";
}

export function ChatEmpty(props: { onPick(text: string): void }) {
  const { t } = useWorkspaceI18n();
  const { t: suggestionText } = useAskI18n();
  return (
    <div className="px-1.5 pt-8">
      <h2 className="text-ink-1 text-[24px] leading-[1.35] font-bold">
        {t("empty.greeting", { greeting: t(greetingKey()) })}
        <br />
        <span className="text-accent-text">{t("empty.title")}</span>
      </h2>
      <p className="text-ink-2 text-tau-meta mt-1.5 leading-relaxed">{t("empty.hint")}</p>
      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {suggestionsFor().map((key, index) => {
          const { Icon, tone } = SUGGESTION_STYLES[index % SUGGESTION_STYLES.length];
          return (
            <button
              key={key}
              type="button"
              onClick={() => props.onPick(suggestionPrompt(key))}
              className="bg-surface shadow-card text-ink-1 text-tau-body flex min-h-[92px] flex-col items-start gap-2 rounded-[18px] p-3 text-left leading-snug transition-transform active:scale-[0.98]"
            >
              <span className={`grid h-7 w-7 place-items-center rounded-[9px] ${tone}`}>
                <Icon size={15} aria-hidden="true" />
              </span>
              {suggestionText(key)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 未给「对话」分配模型：入口照常可进，这里引导去设置 */
export function ChatSetup(props: { hasProvider: boolean; onSetup(): void; footer?: ReactNode }) {
  const { t } = useWorkspaceI18n();
  return (
    <div className="px-1 pt-10">
      <span className="bg-accent-soft text-accent-text mx-auto grid h-[72px] w-[72px] place-items-center rounded-[24px]">
        <KeyRound size={30} aria-hidden="true" />
      </span>
      <h2 className="text-ink-1 mt-4 text-center text-[18px] font-extrabold">{t("setup.title")}</h2>
      <p className="text-ink-2 text-tau-meta mt-1.5 text-center leading-relaxed">
        {props.hasProvider ? t("setup.assigned") : t("setup.empty")}
      </p>
      <button
        type="button"
        onClick={props.onSetup}
        className="bg-accent text-ink-inverse text-tau-body shadow-lift mt-6 h-12 w-full rounded-[14px] font-semibold"
      >
        {props.hasProvider ? t("setup.select") : t("setup.add")}
      </button>
      {props.footer}
    </div>
  );
}
