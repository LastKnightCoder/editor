import { useToolsI18n } from "../tools.i18n";
import { useConversationI18n } from "../conversation.i18n";
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
  startOfDay,
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
  const context = useToolsI18n();
  const { t, locale } = context;
  const { t: referenceT } = useConversationI18n();
  const host = useChatToolHost();
  const results = list(props.output.results);
  if (!results.length) return <Empty>{t("detail.noSearch")}</Empty>;
  const total = num(props.output.total);
  return (
    <div>
      <div className={cn(GROUP, DIVIDED, "overflow-hidden")}>
        {results.map((item, index) => {
          const type = str(item.type) ?? "";
          const kind = referenceKindOf(type) ?? FALLBACK_REFERENCE_KIND;
          const Icon = kind.icon;
          const id = num(item.id);
          const title = str(item.title)?.trim() || t("detail.untitled");
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
                  {[referenceT(kind.labelKey), container, excerpt].filter(Boolean).join(" · ")}
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
          {t("detail.searchTotal", {
            count: total,
            total: formatCount(total, locale),
            shown: formatCount(results.length, locale),
          })}
        </Footer>
      )}
    </div>
  );
}

function MarkdownBody(props: { output: Data; close(): void }) {
  const context = useToolsI18n();
  const { t } = context;
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
        <Empty>{t("detail.noContent")}</Empty>
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
          {t("detail.openNote")}
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
  const context = useToolsI18n();
  const { t, locale } = context;
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
            {t("detail.rows", { count: rowCount, number: formatCount(rowCount, locale) })}
            {rows.length > MAX_TABLE_ROWS &&
              t("detail.firstRows", { number: formatCount(MAX_TABLE_ROWS, locale) })}
            {columns.length > 2 && t("detail.moreColumns")}
          </Footer>
        </div>
      ) : (
        <Empty>{t("detail.noRows")}</Empty>
      )}
    </div>
  );
}

function TodoListBody(props: { output: Data; close(): void }) {
  const context = useToolsI18n();
  const { t, locale } = context;
  const items = list(props.output.items);
  if (!items.length) return <Empty>{t("detail.noTodos")}</Empty>;
  const total = num(props.output.total) ?? items.length;
  return (
    <div>
      <div className={cn(GROUP, DIVIDED, "overflow-hidden")}>
        {items.map((item, index) => {
          const id = Number(str(item.taskRef));
          const due = formatDue(item.dueAt, context);
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
                {str(item.title) || t("detail.untitledTodo")}
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
      {total > items.length && (
        <Footer>
          {t("detail.moreTodos", {
            count: total - items.length,
            number: formatCount(total - items.length, locale),
          })}
        </Footer>
      )}
    </div>
  );
}

function EventListBody(props: { output: Data; close(): void }) {
  const context = useToolsI18n();
  const { t } = context;
  const events = list(props.output.events);
  if (!events.length) return <Empty>{t("detail.noEvents")}</Empty>;
  const days = new Map<number | "other", { label: string; events: Data[] }>();
  for (const event of events) {
    const start = parseLocalText(event.start);
    const key = start ? startOfDay(start.date) : "other";
    const day = days.get(key) ?? {
      label: start ? dayLabel(start.date, context) : t("detail.other"),
      events: [],
    };
    day.events.push(event);
    days.set(key, day);
  }
  return (
    <div className="space-y-3">
      {[...days].map(([key, { label: day, events: items }]) => (
        <div key={key}>
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
                    {allDay ? t("date.allDay") : (parseLocalText(event.start)?.time ?? "")}
                  </span>
                  <span aria-hidden className="bg-tag-2 h-[22px] w-[3px] shrink-0 rounded-full" />
                  <span className="text-tau-body text-ink-1 min-w-0 flex-1 truncate">
                    {str(event.title) || t("detail.untitledEvent")}
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
  const context = useToolsI18n();
  const { t } = context;
  const item = props.output.item as Data | undefined;
  const event = props.output.event as Data | undefined;
  const fields = item
    ? [
        { id: "title", label: t("field.title"), value: str(item.title) },
        { id: "due", label: t("field.due"), value: formatDue(item.dueAt, context) },
        { id: "group", label: t("field.group"), value: str(item.group) },
      ]
    : event
      ? [
          { id: "title", label: t("field.title"), value: str(event.title) },
          {
            id: "time",
            label: t("field.time"),
            value: formatEventRange(event.start, event.end, event.allDay === true, context),
          },
          { id: "calendar", label: t("field.calendar"), value: str(event.calendar) },
        ]
      : [];
  const shown = fields.flatMap(field => (field.value ? [{ ...field, value: field.value }] : []));
  if (!shown.length) return null;
  return (
    <div className={cn(GROUP, DIVIDED, "px-3.5")}>
      {shown.map(({ id, label, value }) => (
        <div key={id} className="text-tau-body flex min-h-[42px] items-center gap-3 py-2">
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
