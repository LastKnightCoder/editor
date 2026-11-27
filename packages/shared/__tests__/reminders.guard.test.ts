// @vitest-environment node
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  normalizeReminders,
  joinTodoReminders,
  splitTodoReminders,
  reminderLabel,
  reminderBody,
  reminderDetail,
  summarizeReminders,
  getReminderTranslator,
  type ReminderTranslator,
} from "../reminders.ts";
const minute = 60_000,
  hour = 60 * minute;
const capture: ReminderTranslator["t"] = (_key, values) => JSON.stringify(values ?? {});

describe("提醒的格式与存储边界", () => {
  it("归一化过滤非有限值并保持负数全天编码，拆合后不改变有效提醒", () => {
    const input = [
      15 * minute,
      Number.NaN,
      0,
      -9 * hour,
      5 * minute,
      5 * minute,
      Number.POSITIVE_INFINITY,
    ];
    const normalized = normalizeReminders(input);
    expect(normalized).toEqual([-9 * hour, 0, 5 * minute, 15 * minute]);
    const split = splitTodoReminders(input);
    expect(joinTodoReminders(split.first, split.extras)).toEqual(normalized);
    expect(joinTodoReminders(null, [5 * minute])).toEqual([]);
    expect(input[0]).toBe(15 * minute);
  });
  it("全天的负数与任意提醒时刻按零点锚点解释，不按日期格式器回绕小时", () => {
    expect(JSON.parse(reminderLabel(-9 * hour, true, { t: capture }))).toMatchObject({
      count: 0,
      time: "9:00",
    });
    expect(JSON.parse(reminderLabel(25 * hour, true, { t: capture }))).toMatchObject({
      count: 2,
      time: "23:00",
    });
    expect(JSON.parse(reminderLabel(-48 * hour, true, { t: capture }))).toMatchObject({
      count: 0,
      time: "48:00",
    });
    expect(JSON.parse(reminderLabel(90 * minute, false, { t: capture }))).toMatchObject({
      count: 90,
      amount: "90",
    });
  });
  it("截止边界用原毫秒差，翻译回调收到数值而不是格式化状态标识", () => {
    const anchor = new Date(2026, 10, 26, 18, 5).getTime();
    const near = JSON.parse(
      reminderBody({ kind: "todo", anchor, remindAt: anchor - 59_999 }, { t: capture })
    );
    expect(near).toEqual({ range: "18:05" });
    const next = JSON.parse(
      reminderBody(
        { kind: "event", anchor, end: anchor + hour, remindAt: anchor - minute },
        { t: capture }
      )
    );
    expect(next).toMatchObject({ count: 1, amount: "1", range: "18:05 – 19:05" });
    const overdue = JSON.parse(
      reminderBody({ kind: "todo", anchor, remindAt: anchor + 1 }, { t: capture })
    );
    expect(overdue).toMatchObject({ count: 1, amount: "1" });
  });
  it("是否省略今天由日期决定，不由翻译后的日名决定", () => {
    const translator = getReminderTranslator("en-US");
    const t: ReminderTranslator["t"] = (key, values) =>
      key.startsWith("day.") ? "custom-day" : translator.t(key, values);
    const anchor = new Date(2026, 10, 26, 18, 5).getTime();
    const same = reminderDetail(
      { kind: "todo", anchor, now: anchor - hour },
      { locale: "en-US", t }
    );
    const tomorrow = reminderDetail(
      { kind: "todo", anchor, now: anchor - 24 * hour },
      { locale: "en-US", t }
    );
    expect(same).not.toContain("custom-day");
    expect(tomorrow).toContain("custom-day");
    const values = [minute, 5 * minute];
    const copy = [...values];
    for (const locale of ["zh-CN", "zh-TW", "en-US"])
      summarizeReminders(values, false, { locale, compact: true });
    expect(values).toEqual(copy);
    expect(reminderLabel(5 * minute, false, { locale: "en-US", compact: true })).not.toBe(
      reminderLabel(5 * minute, false, { locale: "en-US" })
    );
  });
  it("Node 原生加载不引入 DOM 或应用设置，实际完成编码拆合及英文格式化", () => {
    const script = `const m=await import('./reminders.ts'); console.log(JSON.stringify([typeof document,m.splitTodoReminders([300000,0,300000]),m.reminderLabel(900000,false,{locale:'en-US',t:(_key,values)=>JSON.stringify(values)})]));`;
    const output = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script],
      { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8" }
    );
    const [dom, split, label] = JSON.parse(output);
    expect(dom).toBe("undefined");
    expect(split).toEqual({ first: 0, extras: [300000] });
    expect(JSON.parse(label)).toEqual({ count: 15, amount: "15" });
  });
});
