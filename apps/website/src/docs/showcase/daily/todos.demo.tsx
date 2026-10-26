/**
 * 待办页：快速添加 + 按日期议程。可以在输入框写一句话回车添加，点圆圈完成，
 * 完成的条目收进段尾「已完成」。结构按 features/todos 的 QuickAddBar 与 AgendaPanel 重建。
 */
import { useMemo, useState } from "react";
import { CalendarClock, ChevronRight, Flag, Repeat, Sparkles, Undo2 } from "lucide-react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";
import { PROJECTS } from "./projects.ts";
import { GroupDot, TodoCheck } from "./TodoBits.tsx";
import { parseQuickAdd, type Bucket, type QuickKind } from "./quickAdd.ts";

interface Todo {
  id: number;
  title: string;
  kind: QuickKind;
  bucket: Bucket;
  main?: string;
  sub?: string;
  project?: string;
  done: boolean;
  overdue?: boolean;
  fresh?: boolean;
}

const INITIAL: Todo[] = [
  {
    id: 1,
    title: "回复出版社的样章意见",
    kind: "deadline",
    bucket: "today",
    main: "昨天",
    sub: "截止",
    project: "工作",
    done: false,
    overdue: true,
  },
  {
    id: 2,
    title: "晨读 30 分钟",
    kind: "recurring",
    bucket: "today",
    main: "每天",
    sub: "打卡",
    project: "学习",
    done: false,
  },
  {
    id: 3,
    title: "整理《深度工作》读书卡片",
    kind: "deadline",
    bucket: "today",
    main: "15:00",
    sub: "截止",
    project: "学习",
    done: false,
  },
  {
    id: 4,
    title: "预约体检",
    kind: "normal",
    bucket: "today",
    project: "生活",
    done: true,
  },
  {
    id: 5,
    title: "周会：Q4 选题评审",
    kind: "deadline",
    bucket: "tomorrow",
    main: "10:00",
    sub: "截止",
    project: "工作",
    done: false,
  },
];

const SECTIONS: { bucket: Bucket; label: string; hint?: string }[] = [
  { bucket: "today", label: "今天", hint: "10月26日 · 周一" },
  { bucket: "tomorrow", label: "明天" },
  { bucket: "later", label: "本周稍后" },
  { bucket: "none", label: "无日期" },
];

const TOKEN_CLASS: Record<QuickKind, string> = {
  normal: "bg-hover text-ink-1",
  deadline: "bg-warn-soft text-ink-1 [&_svg]:text-warn",
  recurring: "bg-ok-soft text-ink-1 [&_svg]:text-ok",
};
const TOKEN_ICON = { normal: CalendarClock, deadline: Flag, recurring: Repeat };

function Row({ todo, onToggle }: { todo: Todo; onToggle: () => void }) {
  const recurring = todo.kind === "recurring";
  const checked = todo.done;
  return (
    <div
      className={cn(
        "hover:bg-hover ease-tau-out grid min-h-[42px] grid-cols-[74px_22px_minmax(0,1fr)_auto] items-center gap-2 rounded-[9px] py-[3px] pr-2.5 pl-2 transition-[background,opacity] duration-150",
        todo.fresh && "animate-doc-flash"
      )}
    >
      <span className="flex min-w-0 flex-col leading-[1.25]">
        {todo.main && (
          <>
            <b
              className={cn(
                "truncate text-[12.5px] font-medium tabular-nums",
                checked ? "text-ink-3" : todo.overdue ? "text-danger" : "text-ink-1"
              )}
            >
              {todo.main}
            </b>
            <span className="text-ink-3 truncate text-[10.5px]">{todo.sub}</span>
          </>
        )}
      </span>
      <TodoCheck
        checked={checked}
        recurring={recurring}
        overdue={todo.overdue}
        onToggle={onToggle}
      />
      <span
        className={cn(
          "text-tau-body truncate transition-colors duration-150",
          !recurring && checked && "text-ink-3 line-through"
        )}
      >
        {todo.title || "未命名任务"}
      </span>
      <span className="flex items-center gap-2.5">
        {todo.project && PROJECTS[todo.project] && (
          <span className="text-ink-2 flex items-center gap-1.5 text-[11.5px] whitespace-nowrap">
            <GroupDot tone={PROJECTS[todo.project]} />
            {todo.project}
          </span>
        )}
        {todo.kind === "deadline" && <Flag className="text-warn size-[13px]" strokeWidth={1.75} />}
        {recurring && <Repeat className="text-ok size-[13px]" strokeWidth={1.75} />}
      </span>
    </div>
  );
}

export default function TodosDemo() {
  const [todos, setTodos] = useState(INITIAL);
  const [text, setText] = useState("");
  const [toast, setToast] = useState<{ id: number; title: string } | null>(null);
  const [openDone, setOpenDone] = useState<Bucket | null>(null);
  const parsed = useMemo(() => parseQuickAdd(text), [text]);

  const toggle = (id: number) => {
    setTodos(list =>
      list.map(todo => (todo.id === id ? { ...todo, done: !todo.done, fresh: false } : todo))
    );
    const target = todos.find(todo => todo.id === id);
    if (target && !target.done && target.kind !== "recurring")
      setToast({ id, title: target.title });
  };

  const submit = () => {
    if (!parsed?.title) return;
    const id = Date.now();
    setTodos(list => [
      ...list.map(todo => ({ ...todo, fresh: false })),
      { id, ...parsed, done: false, fresh: true },
    ]);
    setText("");
  };

  return (
    <AppWindow active="todos" crumb="待办" height={430}>
      <div className="flex h-full flex-col px-8 pt-5 max-sm:px-4">
        <div className="mb-3 flex h-10 shrink-0 items-center gap-3">
          <h3 className="text-tau-title-lg font-semibold tracking-[-0.01em]">待办</h3>
          <span className="text-tau-meta text-ink-2 max-sm:hidden">
            今天 <b className="text-ink-1 font-semibold">3</b> 项 ·{" "}
            <b className="text-danger font-semibold">1</b> 项逾期
          </span>
        </div>

        <div className="border-line-1 focus-within:shadow-lift ease-tau-out mb-3 flex shrink-0 flex-col rounded-[14px] border transition-[box-shadow,border-color] duration-150 focus-within:border-transparent">
          <div className="flex h-11 items-center gap-2.5 pr-2 pl-3.5">
            <Sparkles className="text-accent size-4 shrink-0" strokeWidth={1.75} />
            <input
              value={text}
              onChange={event => setText(event.target.value)}
              onKeyDown={event => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter") submit();
                if (event.key === "Escape") setText("");
              }}
              aria-label="添加任务"
              placeholder="试试「明天 17:00 交周报 #工作」或「每周一、四 周会」"
              className="text-tau-body-lg placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none select-text"
            />
            <span className="text-ink-3 flex shrink-0 items-center gap-1.5 text-[11px]">
              {parsed && "回车添加"}
              <kbd className="bg-hover text-ink-2 rounded-[5px] px-[5px] py-0.5 font-mono text-[11px]">
                {parsed ? "⏎" : "⌘/"}
              </kbd>
            </span>
          </div>
          {parsed && (
            <div className="text-ink-3 flex flex-wrap items-center gap-1.5 pr-3.5 pb-2.5 pl-10 text-[11.5px]">
              识别为
              <span
                className={cn(
                  "inline-flex h-[22px] items-center gap-1.5 rounded-[6px] px-2 [&_svg]:size-3",
                  TOKEN_CLASS[parsed.kind]
                )}
              >
                {(() => {
                  const Icon = TOKEN_ICON[parsed.kind];
                  return <Icon strokeWidth={1.75} />;
                })()}
                {parsed.label}
              </span>
              {parsed.project && (
                <span className="bg-hover text-ink-1 inline-flex h-[22px] items-center gap-1.5 rounded-[6px] px-2">
                  <GroupDot tone={PROJECTS[parsed.project] ?? "tag-5"} />
                  {parsed.project}
                </span>
              )}
              <span className="ml-1.5">
                标题：
                <b className="text-ink-1 font-medium">{parsed.title || "（空）"}</b>
              </span>
            </div>
          )}
        </div>

        <div className="scrollbar-hide -mx-1.5 min-h-0 flex-1 overflow-y-auto pb-4">
          {SECTIONS.map(section => {
            const items = todos.filter(todo => todo.bucket === section.bucket);
            if (!items.length && section.bucket !== "today") return null;
            const open = items.filter(todo => !todo.done || todo.kind === "recurring");
            const done = items.filter(todo => todo.done && todo.kind !== "recurring");
            const expanded = openDone === section.bucket;
            return (
              <section key={section.bucket} className="mb-[18px]">
                <header className="flex items-baseline gap-2.5 px-2.5 pt-1.5 pb-2.5">
                  <span className="text-[16px] font-semibold tracking-[-0.01em]">
                    {section.label}
                  </span>
                  {section.hint && <span className="text-ink-3 text-[11.5px]">{section.hint}</span>}
                  <span className="text-ink-3 ml-auto text-[11.5px] tabular-nums">
                    {open.length} 项{done.length > 0 && ` · ${done.length} 已完成`}
                  </span>
                </header>
                {open.length === 0 && (
                  <p className="text-ink-3 px-3.5 py-2.5 text-[12.5px]">今天的任务都完成了</p>
                )}
                {open.map(todo => (
                  <Row key={todo.id} todo={todo} onToggle={() => toggle(todo.id)} />
                ))}
                {done.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setOpenDone(expanded ? null : section.bucket)}
                      className="text-ink-3 hover:text-ink-2 flex items-center gap-1 px-2.5 py-1.5 text-[12px]"
                    >
                      <ChevronRight
                        className={cn(
                          "size-3 transition-transform duration-200",
                          expanded && "rotate-90"
                        )}
                        strokeWidth={1.75}
                      />
                      已完成 {done.length}
                    </button>
                    <div
                      className={cn(
                        "ease-tau-out grid transition-[grid-template-rows] duration-200",
                        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      )}
                    >
                      <div className="min-h-0 overflow-hidden">
                        {done.map(todo => (
                          <Row key={todo.id} todo={todo} onToggle={() => toggle(todo.id)} />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {toast && (
        <div
          key={toast.id}
          className="bg-surface shadow-float text-tau-sm animate-doc-in absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 whitespace-nowrap"
        >
          已完成「{toast.title}」
          <button
            type="button"
            onClick={() => {
              setTodos(list =>
                list.map(todo => (todo.id === toast.id ? { ...todo, done: false } : todo))
              );
              setToast(null);
            }}
            className="text-accent-text hover:bg-accent-soft flex items-center gap-1 rounded-full px-2.5 py-1 font-medium"
          >
            <Undo2 className="size-3.5" strokeWidth={1.75} />
            撤销
          </button>
        </div>
      )}
    </AppWindow>
  );
}
