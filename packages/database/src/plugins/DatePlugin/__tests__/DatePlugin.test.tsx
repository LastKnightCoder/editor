import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DatePlugin from "..";
import { describeDate } from "../utils/dateUtils";

const NOW = new Date(2026, 8, 30, 15, 10).getTime(); // 2026-09-30 周三 15:10
const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();
const one = (ts: number) => ({ start: ts, end: ts });

describe("describeDate 单日期", () => {
  it.each([
    [at(2026, 9, 30), "今天", null, "today"],
    [at(2026, 10, 1), "明天", null, "future"],
    [at(2026, 9, 29), "昨天", null, "past"],
    [at(2026, 10, 12), "10月12日", "12 天后", "future"],
    [at(2026, 10, 27), "10月27日", "4 周后", "future"],
    [at(2026, 9, 26), "9月26日", "4 天前", "past"],
    [at(2027, 1, 8), "2027年1月8日", "3 个月后", "future"],
    [at(2025, 11, 12), "2025年11月12日", "11 个月前", "past"],
  ])("%#: 本年省略年份、±1 天用相对词", (ts, label, hint, tone) => {
    expect(describeDate(one(ts), {}, NOW)).toMatchObject({
      kind: "single",
      label,
      hint,
      tone,
      time: null,
    });
  });

  it("含时间时去掉秒，今天已过去的时刻降灰", () => {
    expect(describeDate(one(at(2026, 9, 30, 16, 0)), { showTime: true }, NOW)).toMatchObject({
      label: "今天",
      time: "16:00",
      tone: "today",
    });
    expect(describeDate(one(at(2026, 9, 30, 9, 30)), { showTime: true }, NOW)).toMatchObject({
      tone: "past",
    });
  });

  it("悬停提示给出完整绝对日期", () => {
    expect(describeDate(one(at(2026, 10, 2, 9, 30)), { showTime: true }, NOW)?.title).toBe(
      "2026年10月2日 周五 09:30"
    );
  });

  it("非范围列只看 start，空值返回 null", () => {
    const value = { start: at(2026, 10, 12), end: at(2026, 10, 20) };
    expect(describeDate(value, {}, NOW)).toMatchObject({ kind: "single", label: "10月12日" });
    expect(describeDate({ start: null, end: null }, {}, NOW)).toBeNull();
    expect(describeDate(null, { isRange: true }, NOW)).toBeNull();
  });
});

describe("describeDate 范围", () => {
  const range = { isRange: true };
  const timed = { isRange: true, showTime: true };

  it("进行中：按自然日计算进度，提示剩余时间", () => {
    const display = describeDate({ start: at(2026, 9, 21), end: at(2026, 10, 9) }, range, NOW);
    expect(display).toMatchObject({
      kind: "range",
      start: "9月21日",
      end: "10月9日",
      status: "live",
      hint: "剩 9 天",
    });
    // 9 天 + 15:10 / 19 天
    expect(display?.kind === "range" && display.progress).toBeCloseTo(
      (9 + (15 + 10 / 60) / 24) / 19
    );
  });

  it("同月省略结束月份；未开始提示开始时间", () => {
    expect(
      describeDate({ start: at(2026, 10, 5), end: at(2026, 10, 18) }, range, NOW)
    ).toMatchObject({
      start: "10月5日",
      end: "18日",
      status: "upcoming",
      progress: 0,
      hint: "5 天后开始",
    });
  });

  it("已结束显示时长（含首尾两天）", () => {
    expect(describeDate({ start: at(2026, 9, 1), end: at(2026, 9, 26) }, range, NOW)).toMatchObject(
      {
        end: "26日",
        status: "done",
        progress: 1,
        hint: "26 天",
      }
    );
  });

  it("跨年范围首尾都写年份，非本年的同年范围只在开头写年份", () => {
    expect(
      describeDate({ start: at(2026, 12, 28), end: at(2027, 1, 4) }, range, NOW)
    ).toMatchObject({
      start: "2026年12月28日",
      end: "2027年1月4日",
    });
    expect(
      describeDate({ start: at(2025, 10, 1), end: at(2025, 12, 20) }, range, NOW)
    ).toMatchObject({
      start: "2025年10月1日",
      end: "12月20日",
    });
  });

  it("结束日当天提示今天结束", () => {
    expect(
      describeDate({ start: at(2026, 9, 28), end: at(2026, 9, 30) }, range, NOW)
    ).toMatchObject({
      status: "live",
      hint: "今天结束",
    });
  });

  it("同日时段只写一次日期，按时刻计算状态", () => {
    expect(
      describeDate({ start: at(2026, 9, 30, 14, 0), end: at(2026, 9, 30, 16, 30) }, timed, NOW)
    ).toMatchObject({
      start: "今天",
      end: null,
      startTime: "14:00",
      endTime: "16:30",
      status: "live",
      hint: "剩 1 小时 20 分",
    });
    expect(
      describeDate({ start: at(2026, 9, 30, 9, 30), end: at(2026, 9, 30, 9, 45) }, timed, NOW)
    ).toMatchObject({ status: "done", hint: "15 分钟" });
    expect(
      describeDate({ start: at(2026, 9, 30, 17, 0), end: at(2026, 9, 30, 18, 0) }, timed, NOW)
    ).toMatchObject({ status: "upcoming", hint: "1 小时 50 分后开始" });
  });

  it("只有开始日期：显示已持续时长", () => {
    expect(describeDate({ start: at(2026, 9, 15), end: null }, range, NOW)).toMatchObject({
      start: "9月15日",
      end: null,
      status: "open",
      hint: "已 2 周",
    });
  });

  it("同日不含时间或首尾相同按单日期展示，首尾颠倒时自动纠正", () => {
    expect(
      describeDate({ start: at(2026, 9, 30), end: at(2026, 9, 30, 12) }, range, NOW)
    ).toMatchObject({
      kind: "single",
      label: "今天",
    });
    expect(
      describeDate({ start: at(2026, 10, 9), end: at(2026, 9, 21) }, range, NOW)
    ).toMatchObject({
      start: "9月21日",
      end: "10月9日",
    });
  });
});

describe("日期单元格渲染", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  const render = (value: unknown, config: Record<string, unknown>) =>
    act(() =>
      root.render(
        <DatePlugin.Renderer
          value={value as never}
          column={{ id: "d", title: "日期", type: "date", config }}
          theme="light"
          readonly
          onCellValueChange={vi.fn()}
        />
      )
    );

  it("进行中的范围渲染进度填充与剩余提示", () => {
    render({ start: at(2026, 9, 21), end: at(2026, 10, 9) }, { isRange: true });
    expect(container.textContent).toBe("9月21日→10月9日剩 9 天");
    expect(container.querySelector<HTMLElement>("[style*='width']")?.style.width).toMatch(
      /^50\.\d+%$/
    );
    expect(container.firstElementChild?.getAttribute("title")).toBe(
      "2026年9月21日 周一 → 2026年10月9日 周五"
    );
  });

  it("随分钟时钟推进刷新相对文案", () => {
    render(
      { start: at(2026, 9, 30, 14, 0), end: at(2026, 9, 30, 16, 30) },
      { isRange: true, showTime: true }
    );
    expect(container.textContent).toContain("剩 1 小时 20 分");
    act(() => vi.advanceTimersByTime(60_000));
    expect(container.textContent).toContain("剩 1 小时 19 分");
  });

  it("空值渲染空单元格", () => {
    render({ start: null, end: null }, {});
    expect(container.textContent).toBe("");
  });
});

it("早期单个时间戳读作同一天的范围，保存仍归一化为范围", () => {
  const timestamp = 1700000000000;
  expect(DatePlugin.beforeSave?.(timestamp, {})).toEqual({ start: timestamp, end: timestamp });
  expect(DatePlugin.afterLoad?.(timestamp, {})).toEqual({ start: timestamp, end: timestamp });
  expect(DatePlugin.afterLoad?.("2025-10-01", {})).toEqual({ start: null, end: null });
  expect(DatePlugin.afterLoad?.({ start: timestamp, end: timestamp }, {})).toEqual({
    start: timestamp,
    end: timestamp,
  });
});
