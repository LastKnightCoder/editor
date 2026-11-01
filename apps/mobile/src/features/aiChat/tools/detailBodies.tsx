// 详情面板里各内置工具的结果：按手机端对应页面的样子画（搜索结果、待办列表、日程列表、查询表格）。
// 结果行点按打开预览或跳到详情页；没有专门展示的工具只给原始数据。

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import { MarkdownRenderer } from "@tau/chat-ui/conversation";
import { cn } from "@tau/ui";
import { getNavigator } from "../../../router";
import { canResolveChatReference } from "../references";
import { FALLBACK_REFERENCE_KIND, referenceKindOf } from "../referenceKinds";
import { useChatToolHost } from "./context";
import {
  dayLabel,
  formatCount,
  formatDue,
  formatEventRange,
  isOverdue,
  list,
  num,
  parseLocalText,
  str,
} from "./format";
import { SectionLabel, TodoMark } from "./parts";
import { ImageGrid } from "./ImageResult";
import { DIVIDED, GROUP, parseImagePayload } from "./results";

type Data = Record<string, unknown>;

const ROW = "flex w-full min-w-0 items-center gap-3 px-3 text-left";

function Empty(props: { children: ReactNode }) {
  return (
    <div className={cn(GROUP, "text-tau-meta text-ink-3 px-3.5 py-5 text-center")}>
      {props.children}
    </div>
  );
}

function Footer(props: { children: ReactNode }) {
  return <div className="text-tau-sm text-ink-3 mt-2 text-center">{props.children}</div>;
}

function SearchBody(props: { output: Data; close(): void }) {
  const host = useChatToolHost();
  const results = list(props.output.results);
  if (!results.length) return <Empty>没有找到相关内容</Empty>;
  const total = num(props.output.total);
  return (
    <div>
      <div className={cn(GROUP, DIVIDED, "overflow-hidden")}>
        {results.map((item, index) => {
          const type = str(item.type) ?? "";
          const kind = referenceKindOf(type) ?? FALLBACK_REFERENCE_KIND;
          const Icon = kind.icon;
          const id = num(item.id);
          const title = str(item.title)?.trim() || "未命名";
          const excerpt = str(item.excerpt)?.trim();
          const container = str(item.container)?.trim();
          const openable = id !== undefined && canResolveChatReference(type);
          const body = (
            <>
              <Icon size={18} aria-hidden className={cn("shrink-0", kind.text)} />
              <span className="min-w-0 flex-1 py-2.5">
                <span className="text-tau-body text-ink-1 block truncate font-semibold">
                  {title}
                </span>
                <span className="text-tau-sm text-ink-3 mt-px block truncate">
                  {[kind.label, container, excerpt].filter(Boolean).join(" · ")}
                </span>
              </span>
              {openable && <ChevronRight size={16} aria-hidden className="text-ink-3 shrink-0" />}
            </>
          );
          return openable ? (
            <button
              key={index}
              type="button"
              className={cn(ROW, "active:bg-surface-hover")}
              onClick={() => {
                props.close();
                host.openReference(id, type, title);
              }}
            >
              {body}
            </button>
          ) : (
            <div key={index} className={ROW}>
              {body}
            </div>
          );
        })}
      </div>
      {total !== undefined && total > results.length && (
        <Footer>
          共 {formatCount(total)} 篇，AI 看了前 {results.length} 篇
        </Footer>
      )}
    </div>
  );
}

function MarkdownBody(props: { output: Data; close(): void }) {
  const host = useChatToolHost();
  const markdown = str(props.output.markdown) ?? "";
  const entity = props.output.entity as Data | undefined;
  const id = num(entity?.id);
  const type = str(entity?.type) ?? "";
  const openable = id !== undefined && canResolveChatReference(type);
  return (
    <div className="space-y-3">
      {markdown.trim() ? (
        <div
          className={cn(
            GROUP,
            "text-ink-2 max-h-[220px] overflow-hidden px-3.5 py-2.5 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
          )}
        >
          <MarkdownRenderer content={markdown.slice(0, 1500)} isDark={host.isDark} />
        </div>
      ) : (
        <Empty>这篇笔记没有正文</Empty>
      )}
      {openable && (
        <button
          type="button"
          onClick={() => {
            props.close();
            host.openReference(id, type, str(entity?.title) ?? "");
          }}
          className="bg-accent text-ink-inverse text-tau-body h-[46px] w-full rounded-[14px] font-semibold active:opacity-80"
        >
          打开笔记
        </button>
      )}
    </div>
  );
}

const SQL_KEYWORDS =
  /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|IS|NULL|AS|ON|JOIN|LEFT|INNER|GROUP|BY|ORDER|LIMIT|OFFSET|HAVING|WITH|COUNT|SUM|AVG|MIN|MAX|DISTINCT|CASE|WHEN|THEN|ELSE|END|DESC|ASC|LIKE|UNION|EXPLAIN|PRAGMA)\b/gi;

function SqlText(props: { sql: string }) {
  const parts = props.sql.split(SQL_KEYWORDS);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 ? (
          <span key={index} className="text-accent-text font-semibold">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}

const MAX_TABLE_ROWS = 50;

function cellText(value: unknown) {
  if (value === null || value === undefined) return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function SqlBody(props: { input: Data; output: Data }) {
  const sql = str(props.input.sql) ?? "";
  const columns = list(props.output.columns).map(column => str(column.name) ?? "");
  const rows = list(props.output.rows);
  const rowCount = num(props.output.rowCount) ?? rows.length;
  return (
    <div className="space-y-3">
      <pre
        data-allow-touchmove="true"
        className={cn(
          GROUP,
          "font-tau-mono text-tau-sm text-ink-1 m-0 overflow-x-auto px-3.5 py-2.5 leading-[1.6] whitespace-pre"
        )}
      >
        <SqlText sql={sql.trim()} />
      </pre>
      {rows.length ? (
        <div>
          <div data-allow-touchmove="true" className={cn(GROUP, "overflow-x-auto")}>
            <table className="text-tau-sm w-full border-collapse">
              <thead>
                <tr>
                  {columns.map(column => (
                    <th
                      key={column}
                      className="text-ink-3 px-3 py-2 text-left font-medium whitespace-nowrap"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, MAX_TABLE_ROWS).map((row, index) => (
                  <tr key={index} className="border-line-1 border-t">
                    {columns.map(column => (
                      <td
                        key={column}
                        className="text-ink-1 max-w-[220px] truncate px-3 py-2 whitespace-nowrap"
                      >
                        {cellText(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Footer>
            共 {formatCount(rowCount)} 行
            {rows.length > MAX_TABLE_ROWS && `，这里显示前 ${MAX_TABLE_ROWS} 行`}
            {columns.length > 2 && "，左右滑动看更多列"}
          </Footer>
        </div>
      ) : (
        <Empty>查询没有返回结果</Empty>
      )}
    </div>
  );
}

function TodoListBody(props: { output: Data; close(): void }) {
  const items = list(props.output.items);
  if (!items.length) return <Empty>没有符合条件的待办</Empty>;
  const total = num(props.output.total) ?? items.length;
  return (
    <div>
      <div className={cn(GROUP, DIVIDED, "overflow-hidden")}>
        {items.map((item, index) => {
          const id = Number(str(item.taskRef));
          const due = formatDue(item.dueAt);
          const completed = item.completed === true;
          return (
            <button
              key={index}
              type="button"
              className={cn(ROW, "active:bg-surface-hover min-h-12")}
              onClick={() => {
                if (!Number.isSafeInteger(id)) return;
                props.close();
                getNavigator().push("todoDetail", { todoId: id });
              }}
            >
              <TodoMark completed={completed} />
              <span
                className={cn(
                  "text-tau-body min-w-0 flex-1 truncate",
                  completed ? "text-ink-3 line-through" : "text-ink-1"
                )}
              >
                {str(item.title) || "未命名待办"}
              </span>
              <span
                className={cn(
                  "text-tau-sm shrink-0",
                  !completed && isOverdue(item.dueAt) ? "text-danger" : "text-ink-3"
                )}
              >
                {due ?? str(item.group) ?? ""}
              </span>
            </button>
          );
        })}
      </div>
      {total > items.length && <Footer>还有 {total - items.length} 项没有列出</Footer>}
    </div>
  );
}

function EventListBody(props: { output: Data; close(): void }) {
  const events = list(props.output.events);
  if (!events.length) return <Empty>这段时间没有日程</Empty>;
  const days = new Map<string, Data[]>();
  for (const event of events) {
    const start = parseLocalText(event.start);
    const key = start ? dayLabel(start.date) : "其他";
    days.set(key, [...(days.get(key) ?? []), event]);
  }
  return (
    <div className="space-y-3">
      {[...days].map(([day, items]) => (
        <div key={day}>
          <SectionLabel>{day}</SectionLabel>
          <div className={cn(GROUP, DIVIDED, "overflow-hidden")}>
            {items.map((event, index) => {
              const id = Number(str(event.eventId));
              const allDay = event.allDay === true;
              return (
                <button
                  key={index}
                  type="button"
                  className={cn(ROW, "active:bg-surface-hover min-h-12")}
                  onClick={() => {
                    if (!Number.isSafeInteger(id)) return;
                    props.close();
                    getNavigator().push("calendarEventDetail", { eventId: id });
                  }}
                >
                  <span className="text-tau-sm text-ink-3 w-11 shrink-0 tabular-nums">
                    {allDay ? "全天" : (parseLocalText(event.start)?.time ?? "")}
                  </span>
                  <span aria-hidden className="bg-tag-2 h-[22px] w-[3px] shrink-0 rounded-full" />
                  <span className="text-tau-body text-ink-1 min-w-0 flex-1 truncate">
                    {str(event.title) || "未命名日程"}
                  </span>
                  <span className="text-tau-sm text-ink-3 shrink-0">
                    {str(event.calendar) ?? ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 写入类的详情：只列这条待办 / 日程的字段（结果卡已经显示，面板里给完整时间） */
function WriteBody(props: { output: Data }) {
  const item = props.output.item as Data | undefined;
  const event = props.output.event as Data | undefined;
  const fields = item
    ? [
        ["标题", str(item.title)],
        ["截止", formatDue(item.dueAt)],
        ["清单", str(item.group)],
      ]
    : event
      ? [
          ["标题", str(event.title)],
          ["时间", formatEventRange(event.start, event.end, event.allDay === true)],
          ["日历", str(event.calendar)],
        ]
      : [];
  const shown = fields.filter((field): field is [string, string] => !!field[1]);
  if (!shown.length) return null;
  return (
    <div className={cn(GROUP, DIVIDED, "px-3.5")}>
      {shown.map(([label, value]) => (
        <div key={label} className="text-tau-body flex min-h-[42px] items-center gap-3 py-2">
          <span className="text-tau-meta text-ink-3 w-14 shrink-0">{label}</span>
          <span className="text-ink-1 min-w-0 flex-1">{value}</span>
        </div>
      ))}
    </div>
  );
}

/** 工具的专门展示（有没有由 results.ts 的 hasDetailBody 判断） */
export function DetailBody(props: {
  execution: ToolCallExecutionState;
  input: Data;
  output: Data;
  close(): void;
}) {
  const { execution, input, output, close } = props;
  switch (execution.toolName) {
    case "search_knowledge":
      return <SearchBody output={output} close={close} />;
    case "get_content_markdown":
      return <MarkdownBody output={output} close={close} />;
    case "sql_query":
      return <SqlBody input={input} output={output} />;
    case "query_todos":
      return <TodoListBody output={output} close={close} />;
    case "query_calendar_events":
      return <EventListBody output={output} close={close} />;
    case "generate_image":
    case "edit_image": {
      const payload = parseImagePayload(execution);
      return payload ? <ImageGrid payload={payload} /> : null;
    }
    default:
      return <WriteBody output={output} />;
  }
}
