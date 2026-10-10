import { TaskAssistantError } from "./contracts";

export interface TaskSchema {
  type?: string;
  description?: string;
  properties?: Record<string, TaskSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: TaskSchema;
  enum?: string[];
  anyOf?: TaskSchema[];
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  [key: string]: unknown;
}

const object = (properties: Record<string, TaskSchema>, required: string[] = []): TaskSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const text: TaskSchema = { type: "string", minLength: 1, maxLength: 2000 };
const id: TaskSchema = { type: "integer", minimum: 1 };
const boolean: TaskSchema = { type: "boolean" };
const nullable = (schema: TaskSchema): TaskSchema => ({ anyOf: [schema, { type: "null" }] });
const choice = (...values: string[]): TaskSchema => ({ type: "string", enum: values });
const array = (items: TaskSchema, maxItems = 50): TaskSchema => ({
  type: "array",
  items,
  minItems: 1,
  maxItems,
});
const date: TaskSchema = { ...text, format: "task-date", description: "YYYY-MM-DD 的绝对日期。" };
const time: TaskSchema = {
  ...text,
  format: "task-time",
  description: "YYYY-MM-DD，或带 Z/±HH:mm 的 ISO 时间；不接受相对词。",
};
const timestamp: TaskSchema = { type: "integer", minimum: 0 };
const taskRef = object(
  {
    kind: choice("todo", "document"),
    todoId: id,
    contentId: id,
    createdAt: timestamp,
    taskId: text,
  },
  ["kind", "createdAt"]
);
const occurrence = object({ seriesId: text, occurrenceDate: date }, ["seriesId", "occurrenceDate"]);
const rule = object(
  {
    type: choice("daily", "weekdays", "weekly", "monthly", "yearly", "custom"),
    interval: { type: "integer", minimum: 1, maximum: 1000 },
    startDate: date,
    endDate: nullable(date),
    weekdays: array({ type: "integer", minimum: 0, maximum: 6 }, 7),
    monthDay: { type: "integer", minimum: 1, maximum: 31 },
    yearMonth: { type: "integer", minimum: 1, maximum: 12 },
    yearDay: { type: "integer", minimum: 1, maximum: 31 },
    maxOccurrences: nullable({ type: "integer", minimum: 1 }),
    excludeHolidays: boolean,
  },
  ["type", "interval", "startDate"]
);
const schedule = object(
  {
    calendarId: id,
    start: time,
    end: {
      ...time,
      description: "结束必须晚于开始；全天安排使用不包含的结束日期，例如当天全天的 end 为次日。",
    },
    allDay: boolean,
  },
  ["start", "end", "allDay"]
);
const request = {
  requestId: { ...text, maxLength: 128, description: "本项稳定请求 ID；重试必须复用。" },
};
const target = { ...request, taskRef, revision: text };
const eventTarget = { ...request, eventId: id, createdAt: timestamp, revision: text };
const patch = object({
  title: { ...text, maxLength: 500 },
  dueAt: nullable(time),
  reminderAt: nullable(time),
  groupId: id,
  parentRef: nullable(taskRef),
  archived: boolean,
});

export const TASK_WRITE_SCHEMAS = {
  create_todo: object(
    {
      ...request,
      title: { ...text, maxLength: 500 },
      groupId: id,
      document: object({ contentId: id, createdAt: timestamp, revision: text, afterTaskId: text }, [
        "contentId",
        "createdAt",
        "revision",
      ]),
      parentRef: taskRef,
      dueAt: nullable(time),
      reminderAt: nullable(time),
      recurrence: rule,
      schedule,
    },
    ["requestId", "title"]
  ),
  update_todo: object({ ...target, patch }, ["requestId", "taskRef", "revision", "patch"]),
  set_todo_completed: object({ ...target, completed: boolean, occurrence }, [
    "requestId",
    "taskRef",
    "revision",
    "completed",
  ]),
  delete_todo: object({ ...target, children: choice("reject", "preserve", "cascade") }, [
    "requestId",
    "taskRef",
    "revision",
  ]),
  set_todo_recurrence: object({ ...target, effectiveDate: date, rule: nullable(rule) }, [
    "requestId",
    "taskRef",
    "revision",
    "effectiveDate",
    "rule",
  ]),
  update_todo_occurrence: object(
    { ...target, occurrence, action: choice("skip", "restore", "reschedule"), scheduledAt: time },
    ["requestId", "taskRef", "revision", "occurrence", "action"]
  ),
  create_calendar_event: object(
    {
      ...request,
      title: { ...text, maxLength: 500 },
      taskRef,
      revision: text,
      occurrence,
      ...schedule.properties,
    },
    ["requestId", "start", "end", "allDay"]
  ),
  update_calendar_event: object(
    {
      ...eventTarget,
      patch: object({ title: text, start: time, end: time, allDay: boolean, calendarId: id }),
    },
    ["requestId", "eventId", "createdAt", "revision", "patch"]
  ),
  delete_calendar_event: object(eventTarget, ["requestId", "eventId", "createdAt", "revision"]),
  undo_task_operation: object({ ...request, operationId: text }, ["requestId", "operationId"]),
} satisfies Record<string, TaskSchema>;

export type TaskWriteName = keyof typeof TASK_WRITE_SCHEMAS;
const page = {
  pageSize: { type: "integer", minimum: 1, maximum: 100 } as TaskSchema,
  cursor: text,
};
export const TASK_READ_SCHEMAS = {
  query_todos: object({
    ...page,
    contentId: id,
    taskRefs: array(taskRef, 100),
    source: choice("all", "todo", "document"),
    keyword: text,
    completed: boolean,
    archived: boolean,
    groupId: id,
    overdue: boolean,
    start: date,
    end: date,
    view: choice("tasks", "occurrences"),
    sort: choice("dueAt", "updatedAt", "title"),
  }),
  query_calendar_events: object({ ...page, start: time, end: time, calendarIds: array(id, 100) }, [
    "start",
    "end",
  ]),
  query_task_operations: object({ ...page, batchId: text, operationId: text, requestId: text }),
} satisfies Record<string, TaskSchema>;
export type TaskReadName = keyof typeof TASK_READ_SCHEMAS;
export type TaskToolName = TaskReadName | TaskWriteName;

export const TASK_TOOL_DESCRIPTIONS: Record<TaskToolName, string> = {
  query_todos:
    "查询独立、周期及正文待办，返回可操作身份和版本。周期实例查询须给日期范围；复杂聚合用 sql_query。",
  query_calendar_events: "查询日期窗口内日程与待办安排，返回来源和版本；不创建周期物化记录。",
  query_task_operations: "查询助理操作回执和撤销状态；超时或 pending 后先查状态，不重复创建。",
  create_todo:
    "创建独立或正文待办，可配置提醒、周期和安排；正文创建前用 query_todos(contentId) 取得 document 身份和版本，不转换为独立记录。",
  update_todo: "修改待办业务字段。截止时间不等于工作安排；省略不改，null 清空。",
  set_todo_completed: "完成或恢复待办；周期任务必须指定 occurrence，不将整个系列标为完成。",
  delete_todo: "删除待办并处理关联安排；有子项必须明确 children=preserve 或 cascade。",
  set_todo_recurrence: "从 effectiveDate 起设置或停止重复规则，保留先前历史；rule=null 停止。",
  update_todo_occurrence:
    "跳过、恢复或改期一次周期任务，保留原始实例身份；reschedule 必须给 scheduledAt。",
  create_calendar_event: "创建独立日程或安排已有待办，必须给明确起止；关联待办时带其 revision。",
  update_calendar_event: "修改用户日程，不能直接修改系统任务标记；改期不修改关联待办截止时间。",
  delete_calendar_event: "删除日程或取消工作安排，保留待办；系统任务标记改用待办工具。",
  undo_task_operation: "撤销助理操作；批量按原成功项逆序传入。后续编辑冲突时拒绝覆盖。",
};

function internalToolSchema(name: TaskToolName): TaskSchema {
  return name in TASK_WRITE_SCHEMAS
    ? object({ items: array(TASK_WRITE_SCHEMAS[name as TaskWriteName]) }, ["items"])
    : TASK_READ_SCHEMAS[name as TaskReadName];
}

/** 本地校验标记不进入模型厂商的 JSON Schema。 */
export function taskToolSchema(name: TaskToolName): TaskSchema {
  const publicSchema = (schema: TaskSchema): TaskSchema => {
    const result = { ...schema };
    delete result.format;
    if (schema.properties)
      result.properties = Object.fromEntries(
        Object.entries(schema.properties).map(([key, value]) => [key, publicSchema(value)])
      );
    if (schema.items) result.items = publicSchema(schema.items);
    if (schema.anyOf) result.anyOf = schema.anyOf.map(publicSchema);
    return result;
  };
  return publicSchema(internalToolSchema(name));
}

export function validateTaskValue(schema: TaskSchema, value: unknown, path = "参数"): void {
  const fail = (message: string): never => {
    throw new TaskAssistantError("INVALID_ARGUMENT", `${path}${message}`);
  };
  if (schema.anyOf) {
    for (const branch of schema.anyOf) {
      try {
        validateTaskValue(branch, value, path);
        return;
      } catch {
        /* 检查下一个合法分支。 */
      }
    }
    fail("的类型不正确");
  }
  if (schema.type === "null") {
    if (value !== null) fail("必须为空");
    return;
  }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("必须是对象");
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in record)) fail(`缺少 ${key}`);
    for (const key of Object.keys(record)) {
      const field = schema.properties?.[key];
      if (!field) {
        if (schema.additionalProperties === false) fail(`包含未知字段 ${key}`);
      } else validateTaskValue(field, record[key], `${path}.${key}`);
    }
    if (schema === taskRef) {
      const valid =
        record.kind === "todo"
          ? "todoId" in record && !("contentId" in record) && !("taskId" in record)
          : "contentId" in record && "taskId" in record && !("todoId" in record);
      if (!valid) fail("的任务身份不完整或混用了来源");
    }
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) fail("必须是数组");
    const values = value as unknown[];
    if (values.length < (schema.minItems ?? 0) || values.length > (schema.maxItems ?? Infinity))
      fail("的数量超出范围");
    values.forEach((entry, index) => validateTaskValue(schema.items!, entry, `${path}[${index}]`));
    return;
  }
  if (schema.type === "integer" || schema.type === "number") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (schema.type === "integer" && !Number.isSafeInteger(value))
    )
      fail("必须是有效数值");
    if (
      (value as number) < (schema.minimum ?? -Infinity) ||
      (value as number) > (schema.maximum ?? Infinity)
    )
      fail("超出范围");
    return;
  }
  if (typeof value !== schema.type) fail(`必须是 ${schema.type}`);
  if (typeof value === "string") {
    if (
      value.trim().length < (schema.minLength ?? 0) ||
      value.length > (schema.maxLength ?? Infinity)
    )
      fail("长度不合法");
    if (schema.enum && !schema.enum.includes(value)) fail("不在允许值中");
    if (schema.format === "task-date" || schema.format === "task-time") {
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
      const timed =
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
      if (
        !(dateOnly || (schema.format === "task-time" && timed)) ||
        !Number.isFinite(Date.parse(value))
      )
        fail("必须是有效绝对日期或带时区的时间");
      const day = value.slice(0, 10);
      if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) fail("日期不存在");
    }
  }
}

export function validateTaskTool(
  name: TaskToolName,
  args: unknown
): asserts args is Record<string, unknown> {
  validateTaskValue(internalToolSchema(name), args);
}
