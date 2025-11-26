import Database from "better-sqlite3";
import { TodoItem, TodoItemType, TodoCalendarSyncType } from "@/types";
import CalendarGroupTable, { CalendarGroup } from "./calendar-group";
import CalendarTable from "./calendar";
import CalendarEventTable from "./calendar-event";
import TodoCalendarMappingTable from "./todo-calendar-mapping";
import TodoRecurrenceTable from "./todo-recurrence";
import { CreateCalendarEvent } from "@/types/calendar";
import holidayServiceModule from "../holiday-service";

// 待办清单日历配置
const TODO_CALENDAR_GROUP_NAME = "待办清单";
const TODO_CALENDARS = [
  { type: "deadline" as const, title: "截止任务", color: "red" },
  { type: "planned" as const, title: "计划任务", color: "blue" },
  { type: "recurring" as const, title: "周期任务", color: "green" },
];

interface TodoCalendars {
  groupId: number;
  deadline: number;
  planned: number;
  recurring: number;
}

export default class TodoCalendarSyncTable {
  private static cachedCalendars: TodoCalendars | null = null;

  static getListenEvents() {
    return {
      "todo-calendar:sync-item": this.syncTodoItem.bind(this),
      "todo-calendar:remove-item": this.removeTodoItem.bind(this),
      "todo-calendar:get-calendars": this.getTodoCalendars.bind(this),
      "todo-calendar:sync-from-event": this.syncFromCalendarEvent.bind(this),
    } as const;
  }

  static initTable(_db: Database.Database) {
    // 不需要额外的表，使用现有的 calendar 和 calendar_event 表
  }

  static upgradeTable(db: Database.Database) {
    // 确保待办清单日历分组和日历存在
    this.ensureTodoCalendars(db);
  }

  // 确保待办清单日历系统存在
  static ensureTodoCalendars(db: Database.Database): TodoCalendars {
    if (this.cachedCalendars) {
      return this.cachedCalendars;
    }

    // 查找或创建待办清单分组（作为系统日历的子分组）
    let group: CalendarGroup | undefined;
    const existingGroups = CalendarGroupTable.getAllGroups(db);

    // 获取系统分组
    const systemGroup = CalendarGroupTable.getSystemGroup(db);

    // 首先查找名为"待办清单"的分组
    group = existingGroups.find((g) => g.name === TODO_CALENDAR_GROUP_NAME);

    if (!group) {
      // 不存在，创建新的子分组（parent为系统分组）
      group = CalendarGroupTable.createGroup(db, {
        name: TODO_CALENDAR_GROUP_NAME,
        isSystem: false,
        parentGroupId: systemGroup.id,
        orderIndex: -1,
      });
    } else {
      // 如果已存在，确保它的parent_group_id正确
      let needsUpdate = false;
      const updates: any = {};

      if (group.isSystem) {
        // 如果之前错误地创建为系统分组，修正为普通分组
        needsUpdate = true;
        updates.isSystem = false;
      }

      if (group.parentGroupId !== systemGroup.id) {
        // 如果parent_group_id不正确，修正它
        needsUpdate = true;
        updates.parentGroupId = systemGroup.id;
      }

      if (needsUpdate) {
        // 使用SQL直接更新（因为isSystem可能需要更新）
        const setClauses: string[] = [];
        const params: any[] = [];

        if (updates.isSystem !== undefined) {
          setClauses.push("is_system = ?");
          params.push(Number(updates.isSystem));
        }
        if (updates.parentGroupId !== undefined) {
          setClauses.push("parent_group_id = ?");
          params.push(updates.parentGroupId);
        }

        if (setClauses.length > 0) {
          params.push(group.id);
          db.prepare(
            `UPDATE calendar_group SET ${setClauses.join(", ")} WHERE id = ?`,
          ).run(...params);
          // 重新获取更新后的分组
          group = CalendarGroupTable.getGroupById(db, group.id);
          console.log(
            "Updated todo calendar group to be a child of system group",
          );
        }
      }
    }

    // 查找或创建三个日历
    const calendars: Partial<TodoCalendars> = { groupId: group.id };
    const allCalendars = CalendarTable.getAllCalendars(db);

    for (const config of TODO_CALENDARS) {
      let calendar = allCalendars.find(
        (c) => c.groupId === group!.id && c.title === config.title,
      );

      if (!calendar) {
        calendar = CalendarTable.createCalendar(db, {
          title: config.title,
          color: config.color as any,
          descriptionContentId: 0,
          archived: false,
          pinned: false,
          visible: true,
          orderIndex: TODO_CALENDARS.indexOf(config),
          groupId: group.id,
        });
      }

      calendars[config.type] = calendar.id;
    }

    this.cachedCalendars = calendars as TodoCalendars;
    return this.cachedCalendars;
  }

  // 获取待办清单日历 ID
  static getTodoCalendars(db: Database.Database): TodoCalendars {
    return this.ensureTodoCalendars(db);
  }

  // 根据任务类型获取对应的日历 ID
  static getCalendarIdForType(
    db: Database.Database,
    type: TodoItemType,
  ): number | null {
    if (type === "normal") return null; // 普通任务不同步到日历

    const calendars = this.ensureTodoCalendars(db);
    switch (type) {
      case "deadline":
        return calendars.deadline;
      case "planned":
        return calendars.planned;
      case "recurring":
        return calendars.recurring;
      default:
        return null;
    }
  }

  // 同步待办项到日历
  static syncTodoItem(
    db: Database.Database,
    params: { todoItem: TodoItem; recurrenceDate?: number },
  ): number | null {
    const { todoItem, recurrenceDate } = params;

    // 普通任务不同步
    if (todoItem.type === "normal") {
      return null;
    }

    const calendarId = this.getCalendarIdForType(db, todoItem.type);
    if (!calendarId) return null;

    // 查找现有映射
    const existingMapping = TodoCalendarMappingTable.getMappingByTodoAndDate(
      db,
      {
        todoItemId: todoItem.id,
        recurrenceDate,
      },
    );

    // 准备事件数据
    const eventData = this.buildEventData(todoItem, calendarId, recurrenceDate);
    if (!eventData) return null;

    let eventId: number;

    if (existingMapping) {
      // 更新现有事件
      try {
        CalendarEventTable.updateEvent(db, {
          id: existingMapping.calendarEventId,
          ...eventData,
        });
        eventId = existingMapping.calendarEventId;
      } catch (e) {
        // 如果事件不存在，创建新的
        const newEvent = CalendarEventTable.createEvent(db, eventData);
        eventId = newEvent.id;

        // 更新映射
        TodoCalendarMappingTable.upsertMapping(db, {
          todoItemId: todoItem.id,
          calendarEventId: eventId,
          syncType: todoItem.type as TodoCalendarSyncType,
          recurrenceDate,
        });
      }
    } else {
      // 创建新事件
      const newEvent = CalendarEventTable.createEvent(db, eventData);
      eventId = newEvent.id;

      // 创建映射
      TodoCalendarMappingTable.createMapping(db, {
        todoItemId: todoItem.id,
        calendarEventId: eventId,
        syncType: todoItem.type as TodoCalendarSyncType,
        recurrenceDate,
      });
    }

    return eventId;
  }

  // 构建日历事件数据
  private static buildEventData(
    todoItem: TodoItem,
    calendarId: number,
    recurrenceDate?: number,
  ): CreateCalendarEvent | null {
    let startDate: number;
    let endDate: number | null = null;
    let startTime: number | null = null;
    let endTime: number | null = null;
    let allDay = true;

    switch (todoItem.type) {
      case "deadline": {
        if (!todoItem.dueAt) return null;
        startDate = this.getDatePart(todoItem.dueAt);
        // 如果有具体时间，设置 startTime
        const dueTime = this.getTimePart(todoItem.dueAt);
        if (dueTime > 0) {
          startTime = dueTime;
          allDay = false;
        }
        break;
      }

      case "planned": {
        if (!todoItem.startAt && !todoItem.dueAt) return null;
        startDate = this.getDatePart(todoItem.startAt || todoItem.dueAt!);
        if (todoItem.dueAt && todoItem.startAt !== todoItem.dueAt) {
          endDate = this.getDatePart(todoItem.dueAt);
        }
        // 如果有具体时间
        if (todoItem.startAt) {
          const start = this.getTimePart(todoItem.startAt);
          if (start > 0) {
            startTime = start;
            allDay = false;
          }
        }
        if (todoItem.dueAt) {
          const end = this.getTimePart(todoItem.dueAt);
          if (end > 0) {
            endTime = end;
            allDay = false;
          }
        }
        break;
      }

      case "recurring":
        if (!recurrenceDate) return null;
        startDate = this.getDatePart(recurrenceDate);
        break;

      default:
        return null;
    }

    return {
      calendarId,
      title: todoItem.title,
      detailContentId: todoItem.descriptionContentId || 0,
      startDate,
      endDate,
      startTime,
      endTime,
      color: null,
      allDay,
    };
  }

  // 获取日期部分（去掉时间）
  private static getDatePart(timestamp: number): number {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  // 获取时间部分（分钟数）
  private static getTimePart(timestamp: number): number {
    const date = new Date(timestamp);
    return date.getHours() * 60 + date.getMinutes();
  }

  // 从时间戳构建完整日期时间
  private static buildTimestamp(
    datePart: number,
    timePart: number | null,
  ): number {
    const date = new Date(datePart);
    if (timePart !== null) {
      date.setHours(Math.floor(timePart / 60), timePart % 60, 0, 0);
    }
    return date.getTime();
  }

  // 删除待办项的日历事件
  static removeTodoItem(
    db: Database.Database,
    params: { todoItemId: number; recurrenceDate?: number },
  ): number {
    const { todoItemId, recurrenceDate } = params;

    if (recurrenceDate !== undefined) {
      // 删除特定周期日期的映射和事件
      const mapping = TodoCalendarMappingTable.getMappingByTodoAndDate(db, {
        todoItemId,
        recurrenceDate,
      });

      if (mapping) {
        try {
          CalendarEventTable.deleteEvent(db, mapping.calendarEventId);
        } catch (e) {
          // 事件可能已经被删除
        }
        return TodoCalendarMappingTable.deleteMapping(db, { id: mapping.id });
      }
      return 0;
    }

    // 删除所有关联的映射和事件
    const mappings = TodoCalendarMappingTable.getMappingsByTodoId(db, {
      todoItemId,
    });

    for (const mapping of mappings) {
      try {
        CalendarEventTable.deleteEvent(db, mapping.calendarEventId);
      } catch (e) {
        // 事件可能已经被删除
      }
    }

    return TodoCalendarMappingTable.deleteMappingsByTodoId(db, { todoItemId });
  }

  // 从日历事件反向同步到待办（当用户在日历上修改事件时调用）
  static syncFromCalendarEvent(
    db: Database.Database,
    params: { calendarEventId: number },
  ): boolean {
    const { calendarEventId } = params;

    // 查找映射
    const mapping = TodoCalendarMappingTable.getMappingByEventId(db, {
      calendarEventId,
    });

    if (!mapping) return false;

    // 获取事件数据
    let event;
    try {
      event = CalendarEventTable.getEventById(db, calendarEventId);
    } catch (e) {
      return false;
    }

    // 获取待办项
    const todoItem = db
      .prepare(`SELECT * FROM todo_item WHERE id = ?`)
      .get(mapping.todoItemId) as any;

    if (!todoItem) return false;

    // 根据同步类型更新待办项
    const now = Date.now();
    let updateSql = "";
    const updateParams: any[] = [];

    switch (mapping.syncType) {
      case "deadline": {
        const dueAt = this.buildTimestamp(event.startDate, event.startTime);
        updateSql = `UPDATE todo_item SET title = ?, due_at = ?, update_time = ? WHERE id = ?`;
        updateParams.push(event.title, dueAt, now, mapping.todoItemId);
        break;
      }

      case "planned": {
        const startAt = this.buildTimestamp(event.startDate, event.startTime);
        const endAt = event.endDate
          ? this.buildTimestamp(event.endDate, event.endTime)
          : null;
        updateSql = `UPDATE todo_item SET title = ?, start_at = ?, due_at = ?, update_time = ? WHERE id = ?`;
        updateParams.push(
          event.title,
          startAt,
          endAt || startAt,
          now,
          mapping.todoItemId,
        );
        break;
      }

      case "recurring":
        // 周期任务只更新标题
        updateSql = `UPDATE todo_item SET title = ?, update_time = ? WHERE id = ?`;
        updateParams.push(event.title, now, mapping.todoItemId);
        break;
    }

    if (updateSql) {
      db.prepare(updateSql).run(...updateParams);
      return true;
    }

    return false;
  }

  // 批量同步周期任务到日历（用于显示日历视图时）
  static async syncRecurringTasksForRange(
    db: Database.Database,
    params: { todoItemId: number; startDate: number; endDate: number },
  ): Promise<number[]> {
    const { todoItemId, startDate, endDate } = params;

    // 获取周期规则
    const recurrence = TodoRecurrenceTable.getRecurrenceByItemId(db, {
      todoItemId,
    });
    if (!recurrence) return [];

    // 获取待办项
    const todoItem = db
      .prepare(
        `SELECT
          ti.*,
          c.content as content_content
        FROM todo_item ti
        LEFT JOIN contents c ON ti.description_content_id = c.id
        WHERE ti.id = ?`,
      )
      .get(todoItemId) as any;

    if (!todoItem) return [];

    const parsedItem = {
      id: todoItem.id,
      groupId: todoItem.group_id,
      parentId: todoItem.parent_id ?? null,
      title: todoItem.title,
      type: todoItem.type as TodoItemType,
      descriptionContentId: todoItem.description_content_id ?? null,
      isCompleted: Boolean(todoItem.is_completed),
      startAt: todoItem.start_at ?? null,
      dueAt: todoItem.due_at ?? null,
      remindBefore: todoItem.remind_before ?? null,
      completedAt: todoItem.completed_at ?? null,
      sortIndex: todoItem.sort_index,
      isArchived: Boolean(todoItem.is_archived),
      createTime: todoItem.create_time,
      updateTime: todoItem.update_time,
    };

    // 如果启用了节假日排除，获取节假日数据
    let holidays: Set<number> | undefined;
    if (recurrence.excludeHolidays) {
      try {
        // 生成日期范围内所有日期（按天）
        const dates: number[] = [];
        const current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(0, 0, 0, 0);

        while (current <= end) {
          dates.push(current.getTime());
          current.setDate(current.getDate() + 1);
        }

        // 批量查询节假日
        const holidayResults = await holidayServiceModule.areHolidays(dates);

        // 构建节假日 Set
        holidays = new Set();
        dates.forEach((date, index) => {
          if (holidayResults[index]) {
            holidays!.add(date);
          }
        });
      } catch (error) {
        // 如果获取节假日失败，继续执行但不排除节假日
        console.error("Failed to fetch holidays:", error);
        holidays = undefined;
      }
    }

    // 计算日期范围内的所有周期日期
    const occurrences = TodoRecurrenceTable.getOccurrencesInRange(
      recurrence,
      startDate,
      endDate,
      holidays,
    );

    const eventIds: number[] = [];

    // 为每个周期日期同步事件
    for (const occurrence of occurrences) {
      const eventId = this.syncTodoItem(db, {
        todoItem: parsedItem,
        recurrenceDate: occurrence,
      });
      if (eventId) {
        eventIds.push(eventId);
      }
    }

    return eventIds;
  }
}
