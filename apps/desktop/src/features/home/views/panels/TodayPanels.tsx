import { useHomeI18n } from "../../i18n";
import { dueDateText, eventTime } from "../../format";
/**
 * 首页「今天要做的事」三块：复习、待办、日程（compact，宽度足够时并排）。
 */

import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { usePage } from "@/page/PageProvider";
import { EmptyNote, Panel, PanelAction, PanelNote, PanelTitle } from "@tau/ui";
import { useHomeSnapshot } from "../../queries";
import type { ReviewDeckLite } from "../../types";

const ROW =
  "rounded-tau-sm ease-tau-out hover:bg-hover w-full text-left transition-[background] duration-[160ms]";

export function ReviewPanel() {
  const { t, locale } = useHomeI18n();
  const number = new Intl.NumberFormat(locale);
  const { data } = useHomeSnapshot();
  const { navigator } = usePage();
  if (!data) return null;
  const dueDecks = data.reviewDecks.filter(d => d.dueCount > 0).length;
  return (
    <Panel variant="outline" pad="compact">
      <PanelTitle className="mb-2.5">
        {t("panels.review")}
        <PanelNote>
          {dueDecks > 0
            ? t("review.summary", {
                cards: number.format(data.reviewDueCount),
                decks: number.format(dueDecks),
              })
            : t("review.noneDue")}
        </PanelNote>
        <PanelAction onClick={() => navigator.push("review")} title={t("review.openHint")}>
          {t("review.open")}
          <ChevronRight size={13} strokeWidth={1.75} />
        </PanelAction>
      </PanelTitle>
      {data.reviewDecks.length > 0 ? (
        data.reviewDecks.map(deck => (
          <DeckRow
            key={deck.id}
            deck={deck}
            onClick={() => navigator.push("review", { deckId: deck.id })}
          />
        ))
      ) : (
        <EmptyNote>{t("review.empty")}</EmptyNote>
      )}
    </Panel>
  );
}

export function TodosPanel() {
  const { t, locale } = useHomeI18n();
  const number = new Intl.NumberFormat(locale);
  const { data } = useHomeSnapshot();
  const { navigator } = usePage();
  if (!data) return null;
  return (
    <Panel variant="outline" pad="compact">
      <PanelTitle className="mb-2.5">
        {t("panels.todos")}
        <PanelNote>
          {t("todos.remaining", {
            count: data.todoRemainingCount,
            value: number.format(data.todoRemainingCount),
          })}
        </PanelNote>
        <PanelAction onClick={() => navigator.push("todos")} title={t("todos.open")}>
          {t("todos.open")}
          <ChevronRight size={13} strokeWidth={1.75} />
        </PanelAction>
      </PanelTitle>
      {data.todos.length > 0 ? (
        data.todos.map(todo => (
          <button
            key={todo.id}
            type="button"
            className={clsx(ROW, "group flex items-center gap-2.5 px-2 py-[7px]")}
            onClick={() => navigator.push("todos", { selectedId: todo.id })}
          >
            <span
              className={clsx(
                "border-ink-3 ease-tau-out group-hover:border-accent size-4 shrink-0 rounded-full border-[1.5px] transition-[border-color] duration-[160ms]",
                todo.overdue && "border-danger"
              )}
            />
            <span className="text-tau-meta min-w-0 flex-1 truncate font-medium">
              {todo.title || t("panels.todos")}
            </span>
            {(todo.overdue || todo.dueAt != null) && (
              <small
                className={clsx(
                  "text-ink-3 shrink-0 whitespace-nowrap text-[10.5px]",
                  todo.overdue && "text-danger"
                )}
              >
                {todo.overdue
                  ? t("todos.overdue", { date: todo.dueAt == null ? "" : dueDateText(todo.dueAt) })
                  : todo.dueAt == null
                    ? ""
                    : dueDateText(todo.dueAt)}
              </small>
            )}
          </button>
        ))
      ) : (
        <EmptyNote>{t("todos.empty")}</EmptyNote>
      )}
    </Panel>
  );
}

export function SchedulePanel() {
  const { t, locale } = useHomeI18n();
  const number = new Intl.NumberFormat(locale);
  const { data } = useHomeSnapshot();
  const { navigator } = usePage();
  if (!data) return null;
  return (
    <Panel variant="outline" pad="compact">
      <PanelTitle className="mb-2.5">
        {t("panels.schedule")}
        <PanelNote>
          {t("calendar.count", {
            count: data.events.length,
            value: number.format(data.events.length),
          })}
        </PanelNote>
        <PanelAction onClick={() => navigator.push("schedule")} title={t("calendar.open")}>
          {t("calendar.open")}
          <ChevronRight size={13} strokeWidth={1.75} />
        </PanelAction>
      </PanelTitle>
      {data.events.length > 0 ? (
        <div className="before:bg-sunken relative pl-3.5 before:absolute before:top-2.5 before:bottom-2.5 before:left-[3.5px] before:w-[1.5px] before:rounded-[1px] before:content-['']">
          {data.events.map(event => (
            <button
              key={event.id}
              type="button"
              className={clsx(ROW, "relative flex items-baseline gap-2.5 px-1.5 py-[4.5px]")}
              onClick={() => navigator.push("schedule", { eventId: event.id })}
            >
              <span className="font-tau-mono text-tau-micro text-ink-3 min-w-10 shrink-0">
                {eventTime(event)}
              </span>
              <span className="text-tau-meta truncate">{event.title || t("panels.schedule")}</span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyNote>{t("calendar.empty")}</EmptyNote>
      )}
    </Panel>
  );
}

/** 复习卡的卡组行：三段条 = 到期 / 学习中 / 已掌握（其余为新卡），点击进复习页选中该卡组 */
function DeckRow({ deck, onClick }: { deck: ReviewDeckLite; onClick: () => void }) {
  const { t, locale } = useHomeI18n();
  const number = new Intl.NumberFormat(locale);
  const mastered = Math.max(
    0,
    deck.totalCards - deck.dueCount - deck.learningCount - deck.newCount
  );
  return (
    <button
      type="button"
      className={clsx(ROW, "flex items-center gap-2.5 px-2 py-[5px]")}
      onClick={onClick}
      title={t("review.breakdown", {
        due: number.format(deck.dueCount),
        learning: number.format(deck.learningCount),
        new: number.format(deck.newCount),
        mastered: number.format(mastered),
      })}
    >
      <span className="text-tau-meta w-[108px] truncate font-medium">{deck.name}</span>
      <span className="bg-sunken flex h-[7px] flex-1 overflow-hidden rounded">
        <i className="bg-warn" style={{ width: pct(deck.dueCount, deck.totalCards) }} />
        <i
          className="bg-accent opacity-80"
          style={{ width: pct(deck.learningCount, deck.totalCards) }}
        />
        <i className="bg-ok opacity-55" style={{ width: pct(mastered, deck.totalCards) }} />
      </span>
      <span className="text-tau-tiny text-ink-2 whitespace-nowrap tabular-nums">
        <b className={deck.dueCount > 0 ? "text-accent-text" : "text-ink-1"}>
          {number.format(deck.dueCount)}
        </b>
        /{number.format(deck.totalCards)}
      </span>
    </button>
  );
}

function pct(part: number, total: number): string {
  return total <= 0 ? "0%" : `${(part / total) * 100}%`;
}
