import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toastInfo } = vi.hoisted(() => ({ toastInfo: vi.fn() }));
vi.mock("@tau/ui", () => ({ toast: { info: toastInfo, error: vi.fn() } }));

import { dragTarget } from "@/hooks/useEventDrag";
import { dropMinutes } from "../todoDrop";
import {
  UNDO_MS,
  flushEventDeletes,
  scheduleEventDelete,
  usePendingDeletes,
} from "../pendingDeleteStore";
import type { CalendarEvent } from "@/types";

const CELL = 12; // 15 分钟

describe("dragTarget：拖动日程块的吸附换算", () => {
  const origin = { dayIndex: 2, start: 540, end: 600 };

  it("平移：15 分钟吸附、可跨列、保持时长", () => {
    expect(dragTarget({ ...origin, mode: "move" }, 13, 2, CELL)).toEqual({
      dayIndex: 2,
      start: 555,
      end: 615,
    });
    expect(dragTarget({ ...origin, mode: "move" }, -5, 4, CELL)).toEqual({
      dayIndex: 4,
      start: 540,
      end: 600,
    });
  });

  it("平移不越过当天首尾", () => {
    expect(dragTarget({ ...origin, mode: "move" }, -CELL * 100, 2, CELL).start).toBe(0);
    expect(dragTarget({ ...origin, mode: "move" }, CELL * 200, 2, CELL)).toEqual({
      dayIndex: 2,
      start: 1439 - 60,
      end: 1439,
    });
  });

  it("改时长：只动结束、不换列，最短 15 分钟、最晚 23:59", () => {
    expect(dragTarget({ ...origin, mode: "resize" }, CELL * 2, 5, CELL)).toEqual({
      dayIndex: 2,
      start: 540,
      end: 630,
    });
    expect(dragTarget({ ...origin, mode: "resize" }, -CELL * 20, 2, CELL).end).toBe(555);
    expect(dragTarget({ ...origin, mode: "resize" }, CELL * 400, 2, CELL).end).toBe(1439);
  });
});

it("dropMinutes：落点吸附到 15 分钟，不越界", () => {
  expect(dropMinutes(9 * 4 * CELL + 5, CELL)).toBe(540);
  expect(dropMinutes(9 * 4 * CELL + 7, CELL)).toBe(555);
  expect(dropMinutes(-20, CELL)).toBe(0);
  expect(dropMinutes(10_000, CELL)).toBe(1439 - 15);
});

describe("延迟删除", () => {
  const event = { id: 7, title: "评审会" } as CalendarEvent;
  beforeEach(() => {
    vi.useFakeTimers();
    toastInfo.mockReset();
    usePendingDeletes.setState({ ids: new Set() });
  });
  afterEach(() => vi.useRealTimers());

  it("立即隐藏，到时才落库", async () => {
    const commit = vi.fn().mockResolvedValue(1);
    scheduleEventDelete(event, commit);
    expect(usePendingDeletes.getState().ids.has(7)).toBe(true);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    expect(commit).toHaveBeenCalledOnce();
    expect(usePendingDeletes.getState().ids.has(7)).toBe(false);
  });

  it("撤销：不落库并恢复显示", async () => {
    const commit = vi.fn().mockResolvedValue(1);
    scheduleEventDelete(event, commit);
    const { action } = toastInfo.mock.calls[0][1] as { action: { onClick(): void } };
    action.onClick();
    expect(usePendingDeletes.getState().ids.size).toBe(0);
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    expect(commit).not.toHaveBeenCalled();
  });

  it("离开页面立即落库", () => {
    const commit = vi.fn().mockResolvedValue(1);
    scheduleEventDelete(event, commit);
    flushEventDeletes();
    expect(commit).toHaveBeenCalledOnce();
  });
});
