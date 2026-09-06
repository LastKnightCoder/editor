import { afterEach, expect, it, vi } from "vitest";
import { PresenceScheduler } from "./presence-scheduler";

afterEach(() => vi.useRealTimers());
it("合并同一内容的在线状态并在关闭时取消待发消息", () => {
  vi.useFakeTimers();
  const publish = vi.fn();
  const scheduler = new PresenceScheduler(publish);
  for (let i = 0; i < 100; i++) scheduler.schedule("content");
  vi.advanceTimersByTime(249);
  expect(publish).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(publish).toHaveBeenCalledTimes(1);
  scheduler.schedule("content");
  scheduler.close();
  vi.advanceTimersByTime(250);
  expect(publish).toHaveBeenCalledTimes(1);
});
