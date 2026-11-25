import Database from "better-sqlite3";
import { CalendarDirectory, Calendar, CreateCalendar, UpdateCalendar } from "@/types/calendar";
import { ProjectColorName } from "@/constants/project-colors";
import { Descendant } from "slate";
import Operation from "./operation";
import ContentTable from "./content";
import CalendarGroupTable from "./calendar-group";
import CalendarEventTable from "./calendar-event";
import type { SqliteRow } from "../../types/table";

const CALENDAR_DIRECTORY_SQL = `WITH RECURSIVE system_groups(id) AS (
  SELECT id FROM calendar_group WHERE is_system=1
  UNION SELECT g.id FROM calendar_group g JOIN system_groups s ON g.parent_group_id=s.id
) SELECT id,title,color,archived,visible,order_index,create_time,
  (group_id IS NULL OR group_id NOT IN (SELECT id FROM system_groups)) AS editable,
  (archived=0 AND (group_id IS NULL OR group_id NOT IN (SELECT id FROM system_groups))) AS writable
  FROM calendar`;

interface CalendarDirectoryRow {
  create_time: number;
  editable: number;
  id: number;
  title: string;
  color: ProjectColorName;
  archived: number;
  visible: number;
  writable: number;
}

export default class CalendarTable {
  static getListenEvents() {
    return {
      "calendar:create": this.createCalendar.bind(this),
      "calendar:update": this.updateCalendar.bind(this),
      "calendar:delete": this.deleteCalendar.bind(this),
      "calendar:get-by-id": this.getCalendarById.bind(this),
      "calendar:get-all": this.getAllCalendars.bind(this),
      "calendar:get-visible": this.getVisibleCalendars.bind(this),
      "calendar:merge": this.mergeCalendars.bind(this),
    };
  }
  static parseCalendar(row: SqliteRow, db: Database.Database): Calendar {
    let description: Descendant[] = [];
    const descriptionContentId = (row.description_content_id as number) || 0;

    if (descriptionContentId) {
      const content = ContentTable.getContentById(db, descriptionContentId);
      description = content?.content || [];
    }

    const groupId = (row.group_id as number | null) || undefined;
    let isInSystemGroup = false;

    // 判断是否在系统分组或系统分组的子分组中
    if (groupId) {
      try {
        const group = CalendarGroupTable.getGroupById(db, groupId);
        // 如果分组本身是系统分组，或者它的父分组是系统分组
        if (group.isSystem) {
          isInSystemGroup = true;
        } else if (group.parentGroupId) {
          try {
            const parentGroup = CalendarGroupTable.getGroupById(db, group.parentGroupId);
            isInSystemGroup = parentGroup.isSystem;
          } catch (e) {
            // 父分组不存在
          }
        }
      } catch (e) {
        // 分组不存在
      }
    }

    return {
      id: row.id as number,
      createTime: row.create_time as number,
      updateTime: row.update_time as number,
      title: row.title as string,
      color: row.color as ProjectColorName,
      description,
      descriptionContentId,
      archived: Boolean(row.archived),
      pinned: Boolean(row.pinned),
      visible: Boolean(row.visible),
      orderIndex: row.order_index as number,
      groupId,
      isInSystemGroup,
    };
  }

  private static insertCalendar(db: Database.Database, data: CreateCalendar): number {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO calendar
      (create_time, update_time, title, color, description_content_id, archived, pinned, visible, order_index, group_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
      now,
      now,
      data.title,
      data.color,
      data.descriptionContentId || 0,
      Number(data.archived || false),
      Number(data.pinned || false),
      Number(data.visible !== undefined ? data.visible : true),
      data.orderIndex || 0,
      data.groupId ?? null
    );

    Operation.insertOperation(db, "calendar", "insert", res.lastInsertRowid, now);

    return Number(res.lastInsertRowid);
  }

  static createCalendar(db: Database.Database, data: CreateCalendar): Calendar {
    return this.getCalendarById(db, this.insertCalendar(db, data));
  }

  static updateCalendar(db: Database.Database, data: UpdateCalendar): Calendar {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE calendar SET
        update_time = ?,
        title = ?,
        color = ?,
        description_content_id = ?,
        archived = ?,
        pinned = ?,
        visible = ?,
        order_index = ?,
        group_id = ?
      WHERE id = ?
    `);

    stmt.run(
      now,
      data.title,
      data.color,
      data.descriptionContentId || 0,
      Number(data.archived || false),
      Number(data.pinned || false),
      Number(data.visible !== undefined ? data.visible : true),
      data.orderIndex || 0,
      data.groupId ?? null,
      data.id
    );

    Operation.insertOperation(db, "calendar", "update", data.id, now);

    return this.getCalendarById(db, data.id);
  }

  static createDirectory(
    db: Database.Database,
    input: import("@tau/shared/task-assistant").CalendarDirectoryInput
  ): number {
    const order = (
      db.prepare("SELECT COALESCE(MAX(order_index),0)+1024 AS value FROM calendar").get() as {
        value: number;
      }
    ).value;
    return this.insertCalendar(db, {
      title: input.title,
      color: input.color ?? "blue",
      visible: input.visible ?? true,
      archived: false,
      pinned: false,
      descriptionContentId: 0,
      orderIndex: order,
    });
  }

  static patchDirectory(
    db: Database.Database,
    id: number,
    patch: import("@tau/shared/task-assistant").CalendarDirectoryPatch
  ): void {
    if (!this.getDirectoryItem(db, id)?.editable) throw new Error("日历目录不存在或不可编辑");
    const fields = Object.entries(patch).filter(([, value]) => value !== undefined);
    db.prepare(
      `UPDATE calendar SET ${fields.map(([key]) => `${key}=?`).join(",")},update_time=? WHERE id=?`
    ).run(
      ...fields.map(([, value]) => (typeof value === "boolean" ? Number(value) : value)),
      Date.now(),
      id
    );
    Operation.insertOperation(db, "calendar", "update", id, Date.now());
  }

  static deleteCalendar(db: Database.Database, id: number): number {
    // 检查是否为系统日历
    const calendar = this.getCalendarById(db, id);
    if (calendar.isInSystemGroup) {
      throw new Error("Cannot delete calendar in system group");
    }

    // 删除所有关联的事件（直接执行 SQL）
    const eventStmt = db.prepare(
      "SELECT id, detail_content_id FROM calendar_event WHERE calendar_id = ?"
    );
    const events = eventStmt.all(id) as Array<{
      id: number;
      detail_content_id: number;
    }>;

    for (const event of events) {
      // 删除事件的详情内容
      if (event.detail_content_id) {
        ContentTable.deleteContent(db, event.detail_content_id);
      }
    }

    // 删除所有事件
    db.prepare("DELETE FROM calendar_event WHERE calendar_id = ?").run(id);

    // 删除日历描述内容
    if (calendar && calendar.descriptionContentId) {
      ContentTable.deleteContent(db, calendar.descriptionContentId);
    }

    const stmt = db.prepare("DELETE FROM calendar WHERE id = ?");
    Operation.insertOperation(db, "calendar", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  private static directoryItem(row: CalendarDirectoryRow): CalendarDirectory {
    return {
      id: row.id,
      createTime: row.create_time,
      editable: !!row.editable,
      title: row.title,
      color: row.color,
      archived: !!row.archived,
      visible: !!row.visible,
      writable: !!row.writable,
    };
  }

  static getDirectoryItem(db: Database.Database, id: number): CalendarDirectory | null {
    const row = db.prepare(`${CALENDAR_DIRECTORY_SQL} WHERE id=?`).get(id) as
      | CalendarDirectoryRow
      | undefined;
    return row ? this.directoryItem(row) : null;
  }

  static queryDirectoryItems(
    db: Database.Database,
    query: { afterId: number; archived?: boolean; limit: number }
  ): CalendarDirectory[] {
    const rows = db
      .prepare(
        `${CALENDAR_DIRECTORY_SQL} WHERE id>? ${query.archived === undefined ? "" : "AND archived=?"} ORDER BY id LIMIT ?`
      )
      .all(
        query.afterId,
        ...(query.archived === undefined ? [] : [Number(query.archived)]),
        query.limit
      ) as CalendarDirectoryRow[];
    return rows.map(row => this.directoryItem(row));
  }

  static findWritableUserCalendarId(db: Database.Database, id?: number): number | null {
    const row = db
      .prepare(
        `SELECT id FROM (${CALENDAR_DIRECTORY_SQL}) WHERE writable=1 ${id === undefined ? "" : "AND id=?"} ORDER BY order_index,id LIMIT 1`
      )
      .get(...(id === undefined ? [] : [id])) as { id: number } | undefined;
    return row?.id ?? null;
  }

  static getCalendarById(db: Database.Database, id: number): Calendar {
    const stmt = db.prepare("SELECT * FROM calendar WHERE id = ?");
    const row = stmt.get(id) as SqliteRow | undefined;
    if (!row) {
      throw new Error(`Calendar with id ${id} not found`);
    }
    return this.parseCalendar(row, db);
  }

  static getAllCalendars(db: Database.Database): Calendar[] {
    const stmt = db.prepare("SELECT * FROM calendar ORDER BY order_index ASC, create_time DESC");
    const rows = stmt.all() as SqliteRow[];
    return rows.map(row => this.parseCalendar(row, db));
  }

  static getVisibleCalendars(db: Database.Database): Calendar[] {
    const stmt = db.prepare(
      "SELECT * FROM calendar WHERE visible = 1 ORDER BY order_index ASC, create_time DESC"
    );
    const rows = stmt.all() as SqliteRow[];
    return rows.map(row => this.parseCalendar(row, db));
  }

  static mergeCalendars(
    db: Database.Database,
    sourceCalendarIds: number[],
    targetCalendarId: number
  ): { transferredEvents: number; deletedCalendars: number } {
    // 验证目标日历
    const targetCalendar = this.getCalendarById(db, targetCalendarId);
    if (targetCalendar.isInSystemGroup) {
      throw new Error("Cannot merge into system calendar");
    }

    // 验证源日历不能包含目标日历
    if (sourceCalendarIds.includes(targetCalendarId)) {
      throw new Error("Source calendars cannot include target calendar");
    }

    let totalTransferredEvents = 0;
    let deletedCalendars = 0;

    // 验证所有源日历并转移事件
    for (const sourceId of sourceCalendarIds) {
      try {
        const sourceCalendar = this.getCalendarById(db, sourceId);

        // 检查是否为系统日历
        if (sourceCalendar.isInSystemGroup) {
          throw new Error(`Cannot merge system calendar: ${sourceCalendar.title}`);
        }

        // 转移事件
        const transferredCount = CalendarEventTable.transferEventsBetweenCalendars(
          db,
          sourceId,
          targetCalendarId
        );
        totalTransferredEvents += transferredCount;

        // 删除源日历
        this.deleteCalendar(db, sourceId);
        deletedCalendars++;
      } catch (error) {
        // 如果某个日历处理失败，记录错误但继续处理其他日历
        console.error(`Failed to merge calendar ${sourceId}:`, error);
        throw error;
      }
    }

    return {
      transferredEvents: totalTransferredEvents,
      deletedCalendars,
    };
  }
}
