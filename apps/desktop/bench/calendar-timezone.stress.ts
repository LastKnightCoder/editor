import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
vi.mock("electron");
vi.mock("../src-electron/main/modules/video-note-index-queue");
import { prepareDatabaseDownload } from "../src-electron/main/modules/database-download";
import { ensureMainSchema } from "../src-electron/main/modules/main-schema";
import {
  createEvent,
  mutateEvent,
  readCalendarEvent,
} from "../src-electron/main/modules/task-assistant/calendar";
import CalendarEvents from "../src-electron/main/modules/tables/calendar-event";

// 使用主库 17 实际提交的建库 SQL，也可在不含历史的源码包中指定相同 SQL 文件。
const legacy = process.env.TAU_CALENDAR_V17_SQL
  ? readFileSync(process.env.TAU_CALENDAR_V17_SQL, "utf8")
  : execFileSync("git", ["show", "f7a4d19ce:packages/db-schema/schema/main.sql"], {
      encoding: "utf8",
    });

it("旧库升级、回滚、重开与旧连接竞争后，历史日程和新日程的绝对时间可对账", () => {
  const dir = mkdtempSync(join(tmpdir(), "tau-calendar-time-"));
  const file = join(dir, "library.db");
  let db = new Database(file);
  const old = new Database(file);
  const stamp =
    "INSERT INTO schema_meta(key,value,updated_at) VALUES('main_schema_version','17',1) ON CONFLICT(key) DO UPDATE SET value=excluded.value";
  try {
    db.exec(legacy);
    db.exec(stamp);
    db.exec(
      "INSERT INTO calendar(id,title,color,create_time,update_time) VALUES(1,'个人','blue',1,1)"
    );
    const seed = db.prepare(
      "INSERT INTO calendar_event(id,title,calendar_id,create_time,update_time,start_date,start_time,end_time,all_day) VALUES(?,'原有日程',1,1,1,?,?,?,?)"
    );
    const remind = db.prepare(
      "INSERT INTO item_reminder(owner_type,owner_id,offset_ms) VALUES('event',?,300000)"
    );
    db.transaction(() => {
      for (let i = 1; i <= 20000; i++) {
        seed.run(
          i,
          Date.UTC(2020, 0, 1) + (i % 366) * 86400000,
          i % 2 ? 540 : null,
          i % 2 ? 600 : null,
          i % 2 ? 0 : 1
        );
        if (i % 4 === 1) remind.run(i);
      }
    })();
    const legacyHash = () => {
      const hash = createHash("sha256");
      for (const row of db
        .prepare(
          "SELECT e.id,e.title,e.calendar_id,e.create_time,e.update_time,e.start_date,e.end_date,e.start_time,e.end_time,e.all_day,r.offset_ms FROM calendar_event e LEFT JOIN item_reminder r ON r.owner_type='event' AND r.owner_id=e.id WHERE e.id<=20000 ORDER BY e.id,r.offset_ms"
        )
        .raw()
        .iterate())
        hash.update(JSON.stringify(row));
      return hash.digest("hex");
    };
    const original = legacyHash();
    db.exec(
      "CREATE TRIGGER fail_upgrade BEFORE INSERT ON schema_meta WHEN NEW.value='18' BEGIN SELECT RAISE(ABORT,'forced migration rollback'); END;"
    );
    // 下载流程在独立候选文件上失败也不能覆盖当前库。
    const candidate = join(dir, "candidate.db");
    db.prepare("VACUUM INTO ?").run(candidate);
    expect(() => prepareDatabaseDownload(candidate)).toThrow("forced migration rollback");
    expect(() => ensureMainSchema(db)).toThrow("forced migration rollback");
    expect(
      db
        .prepare("SELECT name FROM pragma_table_info('calendar_event') WHERE name='start_utc_ms'")
        .get()
    ).toBeUndefined();
    expect(legacyHash()).toBe(original);
    db.exec("DROP TRIGGER fail_upgrade");
    const ready = join(dir, "ready.db");
    db.prepare("VACUUM INTO ?").run(ready);
    prepareDatabaseDownload(ready);
    ensureMainSchema(db);
    old.exec(stamp);
    ensureMainSchema(db);
    expect(
      db.prepare("SELECT count(*) FROM calendar_event WHERE start_utc_ms IS NOT NULL").pluck().get()
    ).toBe(0);
    const start = Date.parse("2026-11-01T01:45:00-04:00");
    for (let i = 0; i < 1000; i++) {
      const first = start + i * 60000;
      const event = createEvent(db, {
        title: "跨区会议",
        calendarId: 1,
        allDay: false,
        start: new Date(first).toISOString(),
        end: new Date(first + 1800000).toISOString(),
        startTimeZone: "America/New_York",
        endTimeZone: "Asia/Tokyo",
        reminderOffsets: [300000],
      });
      expect(event.start).toBe(new Date(first).toISOString());
      const saved = mutateEvent(
        db,
        {
          eventId: event.eventId,
          createdAt: event.createdAt,
          revision: event.revision,
          patch: { title: "改标题" },
        },
        false
      );
      expect(saved).toMatchObject({
        start: event.start,
        end: event.end,
        startTimeZone: "America/New_York",
        endTimeZone: "Asia/Tokyo",
        reminderOffsets: [300000],
      });
      expect(() =>
        old
          .prepare("UPDATE calendar_event SET start_time=(start_time+10)%1440 WHERE id=?")
          .run(event.eventId)
      ).toThrow("升级 Tau");
      expect(readCalendarEvent(db, event.eventId).start).toBe(event.start);
      if (i === 0) {
        const projected = CalendarEvents.getEventById(db, event.eventId);
        expect(new Date(projected.startDate).getDate()).toBe(new Date(first).getDate());
        expect(projected.startTime).toBe(
          new Date(first).getHours() * 60 + new Date(first).getMinutes()
        );
      }
    }
    old.transaction(() => {
      old.exec("DROP TRIGGER dc_calendar_event_update");
      old.exec(legacy);
      old.exec(stamp);
    })();
    const id = 20001;
    const saved = readCalendarEvent(db, id);
    const wall = old.prepare("SELECT start_date,start_time FROM calendar_event WHERE id=?").get(id);
    expect(wall).toMatchObject({ start_time: CalendarEvents.getEventById(db, id).startTime });
    old
      .prepare(
        "UPDATE calendar_event SET title='旧端改名',start_date=start_date,start_time=start_time WHERE id=?"
      )
      .run(id);
    expect(readCalendarEvent(db, id)).toMatchObject({
      title: "旧端改名",
      start: saved.start,
      end: saved.end,
      startTimeZone: saved.startTimeZone,
      endTimeZone: saved.endTimeZone,
    });
    expect(() =>
      old.prepare("UPDATE calendar_event SET start_time=start_time+1 WHERE id=?").run(id)
    ).toThrow("升级 Tau");
    const last = db.prepare("SELECT max(seq) FROM data_change_log").pluck().get();
    db.prepare("UPDATE calendar_event SET end_time_zone='Europe/London' WHERE id=?").run(id);
    expect(
      db
        .prepare(
          "SELECT count(*) FROM data_change_log WHERE seq>? AND domain='event' AND entity_id=? AND action='updated'"
        )
        .pluck()
        .get(last, `${id}:${saved.createdAt}`)
    ).toBe(1);
    db.prepare("UPDATE calendar_event SET end_time_zone='Asia/Tokyo' WHERE id=?").run(id);
    db.close();
    db = new Database(file);
    ensureMainSchema(db);
    expect(legacyHash()).toBe(original);
    expect(
      db
        .prepare(
          "SELECT count(*) FROM calendar_event WHERE start_time_zone='America/New_York' AND end_time_zone='Asia/Tokyo' AND end_utc_ms-start_utc_ms=1800000"
        )
        .pluck()
        .get()
    ).toBe(1000);
    expect(db.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(db.pragma("foreign_key_check")).toEqual([]);
    console.info(
      "旧日程 20000 条，旧提醒 5000 条，跨区日程 1000 条，旧连接拒写 1000 次；升级失败回滚及重开对账通过。"
    );
  } finally {
    old.close();
    if (db.open) db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
