import Database from "better-sqlite3";
import { TodoItem, TodoItemType, TodoCalendarSyncType } from "@/types";
import CalendarGroupTable, { CalendarGroup } from "./calendar-group";
import CalendarTable from "./calendar";
import CalendarEventTable from "./calendar-event";
import TodoCalendarMappingTable from "./todo-calendar-mapping";
import TodoRecurrenceTable from "./todo-recurrence";
import { CreateCalendarEvent } from "@/types/calendar";
import holidayServiceModule from "../holiday-service";
import { taskOccurrencesInRange } from "@tau/shared/task-assistant";
import { dateTime, localDate } from "../task-assistant/common";

// 待办清单日历配置
const TODO_CALENDAR_GROUP_NAME = "待办清单";
const TODO_CALENDARS = [
  { type: "deadline" as const, title: "截止任务", color: "red" },
  { type: "recurring" as const, title: "周期任务", color: "green" },
];

interface TodoCalendars {
  groupId: number;
  deadline: number;
  recurring: number;
}

export default class TodoCalendarSyncTable {
  static getListenEvents() {
    return {
      "todo-calendar:sync-item": this.syncTodoItem.bind(this),
      "todo-calendar:remove-item": this.removeTodoItem.bind(this),
      "todo-calendar:get-calendars": this.getTodoCalendars.bind(this),
      "todo-calendar:cleanup-orphaned": this.cleanupOrphanedEvents.bind(this),
    } as const;
  }

  // 确保待办清单日历系统存在
  static ensureTodoCalendars(db: Database.Database): TodoCalendars {
    // 查找或创建待办清单分组（作为系统日历的子分组）
    let group: CalendarGroup | undefined;
    const existingGroups = CalendarGroupTable.getAllGroups(db);

    // 获取系统分组
    const systemGroup = CalendarGroupTable.getSystemGroup(db);

    // 首先查找名为"待办清单"的分组
    group = existingGroups.find(g => g.name === TODO_CALENDAR_GROUP_NAME);

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
          db.prepare(`UPDATE calendar_group SET ${setClauses.join(", ")} WHERE id = ?`).run(
            ...params
          );
          // 重新获取更新后的分组
          group = CalendarGroupTable.getGroupById(db, group.id);
          console.log("Updated todo calendar group to be a child of system group");
        }
      }
    }

    // 查找或创建三个日历
    const calendars: Partial<TodoCalendars> = { groupId: group.id };
    const allCalendars = CalendarTable.getAllCalendars(db);

    for (const config of TODO_CALENDARS) {
      let calendar = allCalendars.find(c => c.groupId === group!.id && c.title === config.title);

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

    return calendars as TodoCalendars;
  }

  // 获取待办清单日历 ID
  static getTodoCalendars(db: Database.Database): TodoCalendars {
    return this.ensureTodoCalendars(db);
  }

  // 根据任务类型获取对应的日历 ID
  static getCalendarIdForType(db: Database.Database, type: TodoItemType): number | null {
    if (type === "normal") return null; // 普通任务不同步到日历

    const calendars = this.ensureTodoCalendars(db);
    switch (type) {
      case "deadline":
        return calendars.deadline;
      case "recurring":
        return calendars.recurring;
      default:
        return null;
    }
  }

  // 同步待办项到日历
  static syncTodoItem(
    db: Database.Database,
    params: { todoItem: TodoItem; recurrenceDate?: number }
  ): number | null {
    const { todoItem, recurrenceDate } = params;

    // 普通任务不同步
    if (todoItem.type === "normal") {
      return null;
    }

    const calendarId = this.getCalendarIdForType(db, todoItem.type);
    if (!calendarId) return null;

    // 查找现有映射
    const existingMapping = TodoCalendarMappingTable.getMappingByTodoAndDate(db, {
      todoItemId: todoItem.id,
      recurrenceDate,
    });

    // 准备事件数据
    const eventData = this.buildEventData(todoItem, calendarId, recurrenceDate);
    if (!eventData) return null;

    let eventId: number;

    if (existingMapping) {
      // 更新现有事件
      if (
        db.prepare("SELECT id FROM calendar_event WHERE id=?").get(existingMapping.calendarEventId)
      ) {
        CalendarEventTable.updateEvent(db, {
          id: existingMapping.calendarEventId,
          ...eventData,
        });
        eventId = existingMapping.calendarEventId;
      } else {
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
    recurrenceDate?: number
  ): CreateCalendarEvent | null {
    let startDate: number;
    const endDate: number | null = null;
    let startTime: number | null = null;
    const endTime: number | null = null;
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

  // 删除待办项的日历事件
  static removeTodoItem(
    db: Database.Database,
    params: { todoItemId: number; recurrenceDate?: number }
  ): number {
    const { todoItemId, recurrenceDate } = params;

    if (recurrenceDate !== undefined) {
      // 删除特定周期日期的映射和事件
      const mapping = TodoCalendarMappingTable.getMappingByTodoAndDate(db, {
        todoItemId,
        recurrenceDate,
      });

      if (mapping) {
        // 系统标记没有独立正文引用，不经用户日程的正文释放路径。
        db.prepare("DELETE FROM calendar_event WHERE id=?").run(mapping.calendarEventId);
        return TodoCalendarMappingTable.deleteMapping(db, { id: mapping.id });
      }
      return 0;
    }

    // 删除所有关联的映射和事件
    const mappings = TodoCalendarMappingTable.getMappingsByTodoId(db, {
      todoItemId,
    });

    for (const mapping of mappings) {
      db.prepare("DELETE FROM calendar_event WHERE id=?").run(mapping.calendarEventId);
    }

    return TodoCalendarMappingTable.deleteMappingsByTodoId(db, { todoItemId });
  }

  // 批量同步周期任务到日历（用于显示日历视图时）
  static async syncRecurringTasksForRange(
    db: Database.Database,
    params: { todoItemId: number; startDate: number; endDate: number }
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
        WHERE ti.id = ?`
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
        current.setDate(current.getDate() - 365);
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
    const dates = TodoRecurrenceTable.getOccurrencesInRange(
      recurrence,
      startDate,
      endDate,
      holidays
    );

    const eventIds: number[] = [];

    const instances = recurrence.segments?.length
      ? taskOccurrencesInRange(
          recurrence.segments,
          recurrence.occurrenceState ?? {},
          localDate(startDate),
          localDate(endDate),
          holidays
        ).filter(entry => !entry.state.skipped)
      : dates.map(day => ({
          occurrence: { occurrenceDate: localDate(day) },
          scheduledAt: localDate(day),
          state: {},
        }));
    // 来源映射保留原始日期，改期只改变标记展示位置。
    return db.transaction(() => {
      for (const instance of instances) {
        const eventId = this.syncTodoItem(db, {
          todoItem: parsedItem,
          recurrenceDate: dateTime(instance.occurrence.occurrenceDate),
        });
        if (eventId) {
          if (instance.scheduledAt.slice(0, 10) !== instance.occurrence.occurrenceDate) {
            const date = dateTime(localDate(dateTime(instance.scheduledAt)));
            db.prepare(
              "UPDATE calendar_event SET start_date=?,end_date=?,update_time=? WHERE id=?"
            ).run(date, date, Date.now(), eventId);
          }
          eventIds.push(eventId);
        }
      }

      return eventIds;
    })();
  }

  // 清理孤立的日历事件（待办任务已删除但日历事件仍存在）
  static cleanupOrphanedEvents(db: Database.Database): number {
    const calendars = this.getTodoCalendars(db);
    const todoCalendarIds = [calendars.deadline, calendars.recurring];

    let cleanedCount = 0;

    // 方法1：清理有映射但待办项已不存在的事件
    const orphanedMappings = db
      .prepare(
        `
        SELECT tcm.id as mapping_id, tcm.calendar_event_id
        FROM todo_calendar_mapping tcm
        LEFT JOIN todo_item ti ON tcm.todo_item_id = ti.id
        WHERE ti.id IS NULL
      `
      )
      .all() as Array<{ mapping_id: number; calendar_event_id: number }>;

    for (const mapping of orphanedMappings) {
      try {
        CalendarEventTable.deleteEvent(db, mapping.calendar_event_id);
      } catch (e) {
        // 事件可能已经被删除
      }
      TodoCalendarMappingTable.deleteMapping(db, { id: mapping.mapping_id });
      cleanedCount++;
    }

    // 方法2：清理待办日历中没有映射的事件（可能是旧版本遗留的）
    if (todoCalendarIds.length > 0) {
      const placeholders = todoCalendarIds.map(() => "?").join(",");
      const eventsWithoutMapping = db
        .prepare(
          `
          SELECT e.id, e.detail_content_id
          FROM calendar_event e
          LEFT JOIN todo_calendar_mapping tcm ON e.id = tcm.calendar_event_id
          WHERE e.calendar_id IN (${placeholders})
            AND tcm.id IS NULL
        `
        )
        .all(...todoCalendarIds) as Array<{
        id: number;
        detail_content_id: number | null;
      }>;

      for (const event of eventsWithoutMapping) {
        try {
          CalendarEventTable.deleteEvent(db, event.id);
          cleanedCount++;
        } catch (e) {
          // 事件可能已经被删除
        }
      }
    }

    // 方法3：安排（calendar_event.todo_item_id）指向已不存在的待办 → 解除关联，事件留作记录
    //（旧版移动端 / CLI 删除待办时不处理这一列）
    cleanedCount += Number(
      (
        db
          .prepare(
            `UPDATE calendar_event SET todo_item_id = NULL
             WHERE todo_item_id IS NOT NULL AND todo_item_id NOT IN (SELECT id FROM todo_item)`
          )
          .run() as { changes: number }
      ).changes
    );

    return cleanedCount;
  }
}
