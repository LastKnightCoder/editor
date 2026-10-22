/**
 * 首页「今天要做的事」三块：复习、待办、日程（compact，宽度足够时并排）。
 */

import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { usePage } from "@/page/PageProvider";
import { EmptyNote, Panel, PanelAction, PanelNote, PanelTitle } from "@tau/ui";
import { useHomeSnapshot } from "../../queries";
import type { ReviewDeckLite } from "../../types";
import { HomePanelMenu } from "../HomePanels";

const ROW =
  "rounded-tau-sm ease-tau-out hover:bg-hover w-full text-left transition-[background] duration-[160ms]";

export function ReviewPanel() {
  const { data } = useHomeSnapshot();
  const { navigator } = usePage();
  if (!data) return null;
  const dueDecks = data.reviewDecks.filter(d => d.dueCount > 0).length;
  return (
    <Panel variant="outline" pad="compact">
      <PanelTitle className="mb-2.5">
        复习
        <PanelNote>
          {dueDecks > 0 ? `${data.reviewDueCount} 张到期 · ${dueDecks} 个卡组` : "今天没有到期"}
        </PanelNote>
        <PanelAction onClick={() => navigator.push("review")} title="前往闪卡复习">
          前往复习
          <ChevronRight size={13} strokeWidth={1.75} />
        </PanelAction>
        <HomePanelMenu />
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
        <EmptyNote>还没有闪卡卡组</EmptyNote>
      )}
    </Panel>
  );
}

export function TodosPanel() {
  const { data } = useHomeSnapshot();
  const { navigator } = usePage();
  if (!data) return null;
  return (
    <Panel variant="outline" pad="compact">
      <PanelTitle className="mb-2.5">
        待办
        <PanelNote>{data.todoRemainingCount} 项未完成</PanelNote>
        <PanelAction onClick={() => navigator.push("todos")} title="前往待办">
          前往待办
          <ChevronRight size={13} strokeWidth={1.75} />
        </PanelAction>
        <HomePanelMenu />
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
            <span className="text-tau-meta min-w-0 flex-1 truncate font-medium">{todo.title}</span>
            {(todo.overdue || todo.dueText) && (
              <small
                className={clsx(
                  "text-ink-3 shrink-0 whitespace-nowrap text-[10.5px]",
                  todo.overdue && "text-danger"
                )}
              >
                {todo.overdue ? `逾期 · ${todo.dueText ?? ""}` : todo.dueText}
              </small>
            )}
          </button>
        ))
      ) : (
        <EmptyNote>没有待办事项</EmptyNote>
      )}
    </Panel>
  );
}

export function SchedulePanel() {
  const { data } = useHomeSnapshot();
  const { navigator } = usePage();
  if (!data) return null;
  return (
    <Panel variant="outline" pad="compact">
      <PanelTitle className="mb-2.5">
        日程
        <PanelNote>今天 {data.events.length} 项</PanelNote>
        <PanelAction onClick={() => navigator.push("schedule")} title="前往日程">
          前往日程
          <ChevronRight size={13} strokeWidth={1.75} />
        </PanelAction>
        <HomePanelMenu />
      </PanelTitle>
      {data.events.length > 0 ? (
        <div className="before:bg-sunken relative pl-3.5 before:absolute before:bottom-2.5 before:left-[3.5px] before:top-2.5 before:w-[1.5px] before:rounded-[1px] before:content-['']">
          {data.events.map(event => (
            <button
              key={event.id}
              type="button"
              className={clsx(ROW, "relative flex items-baseline gap-2.5 px-1.5 py-[4.5px]")}
              onClick={() => navigator.push("schedule", { eventId: event.id })}
            >
              <span className="font-tau-mono text-tau-micro text-ink-3 min-w-10 shrink-0">
                {event.timeText}
              </span>
              <span className="text-tau-meta truncate">{event.title}</span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyNote>今天没有日程安排</EmptyNote>
      )}
    </Panel>
  );
}

/** 复习卡的卡组行：三段条 = 到期 / 学习中 / 已掌握（其余为新卡），点击进复习页选中该卡组 */
function DeckRow({ deck, onClick }: { deck: ReviewDeckLite; onClick: () => void }) {
  const mastered = Math.max(
    0,
    deck.totalCards - deck.dueCount - deck.learningCount - deck.newCount
  );
  return (
    <button
      type="button"
      className={clsx(ROW, "flex items-center gap-2.5 px-2 py-[5px]")}
      onClick={onClick}
      title={`到期 ${deck.dueCount} · 学习中 ${deck.learningCount} · 新卡 ${deck.newCount} · 已掌握 ${mastered}`}
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
        <b className={deck.dueCount > 0 ? "text-accent-text" : "text-ink-1"}>{deck.dueCount}</b>/
        {deck.totalCards}
      </span>
    </button>
  );
}

function pct(part: number, total: number): string {
  return total <= 0 ? "0%" : `${(part / total) * 100}%`;
}
