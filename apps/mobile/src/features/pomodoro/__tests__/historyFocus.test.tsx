// 专注记录页聚焦模式：从某天日程详情进入时只列该日记录，并可一键回到整周。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PomodoroSession } from "../../../types";
import { PomodoroHistoryPage } from "../PomodoroHistoryPage";
import { DAY_MS, startOfDay, startOfWeek } from "../timer";

const state = vi.hoisted(() => ({
  sessions: [] as unknown[],
  ranges: [] as Array<{ start: number; end: number }>,
}));
vi.mock("../queries", () => ({
  usePomodoroPresets: () => ({ data: [] }),
  usePomodoroWeeklySummary: () => ({ data: [] }),
  usePomodoroSessions: (params: { start: number; end: number }) => {
    state.ranges.push({ start: params.start, end: params.end });
    return { data: state.sessions, isLoading: false };
  },
  presetNameOf: () => "深度工作",
  invalidatePomodoroQueries: vi.fn(),
}));
vi.mock("../../../components/ActionSheet", () => ({ ActionSheet: () => null }));
vi.mock("../../../components/BottomSheet", () => ({ BottomSheet: () => null }));
vi.mock("../../../components/MobileConfirmDialog", () => ({ MobileConfirmDialog: () => null }));
vi.mock("../../../services/tauri", () => ({
  pomodoroUpdateSession: vi.fn(),
  pomodoroDeleteSession: vi.fn(),
}));

/** 2026-09-16 周三：本周一为 09-14，昨天/今天都在本周内 */
const TODAY = new Date(2026, 8, 16, 12).getTime();
const YESTERDAY = new Date(2026, 8, 15, 10).getTime();

function session(id: number, startTime: number): PomodoroSession {
  return {
    id,
    presetId: 1,
    startTime,
    endTime: startTime + 25 * 60_000,
    focusMs: 25 * 60_000,
    pauseTotalMs: 0,
    pauseCount: 0,
    pauses: [],
    status: "completed",
    createTime: startTime,
    updateTime: startTime,
  };
}

let host: HTMLDivElement;
let root: Root;
const render = (focusDay: number | null) =>
  act(() =>
    root.render(<PomodoroHistoryPage focusDay={focusDay} onBack={vi.fn()} onError={vi.fn()} />)
  );
/** 柱图本身也是 section，分组数 = section 数 - 1 */
const groupCount = () => host.querySelectorAll("section").length - 1;
const clickByText = (text: string) =>
  act(() => {
    const button = [...host.querySelectorAll("button")].find(item => item.textContent === text);
    expect(button).toBeDefined();
    button!.click();
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
  state.ranges = [];
  state.sessions = [session(1, TODAY - 60 * 60_000), session(2, YESTERDAY)];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("专注记录页聚焦模式", () => {
  it("聚焦某日只列该日记录，点查整周恢复", () => {
    render(startOfDay(new Date(YESTERDAY)));
    expect(host.textContent).toContain("只看「昨天」的专注记录");
    expect(groupCount()).toBe(1);

    clickByText("查看整周");
    expect(groupCount()).toBe(2);
    expect(host.textContent).not.toContain("只看「昨天」");
  });

  it("聚焦日不在本周时周视图定位到那一周", () => {
    const target = new Date(2026, 8, 2, 9).getTime();
    render(startOfDay(new Date(target)));
    const latest = state.ranges[state.ranges.length - 1];
    expect(latest.start).toBe(startOfWeek(0, new Date(target)));
    expect(latest.end).toBe(latest.start + 7 * DAY_MS - 1);
  });
});
