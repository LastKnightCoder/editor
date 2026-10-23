import { afterEach, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { subscribePluginForeground } from "./foreground";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => vi.fn()) }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("可见性缺失时由前台周期补偿；后台不刷新，注销后不再触发", () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const refresh = vi.fn();
  const stop = subscribePluginForeground(refresh);
  vi.advanceTimersByTime(30_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue("hidden");
  window.dispatchEvent(new Event("focus"));
  vi.advanceTimersByTime(30_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  expect(refresh).toHaveBeenCalledTimes(2);
  stop();
  window.dispatchEvent(new Event("focus"));
  vi.advanceTimersByTime(30_000);
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("原生监听注册晚于切库清理时立即释放", async () => {
  let finish: ((dispose: () => void) => void) | undefined;
  vi.mocked(listen).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const dispose = vi.fn();
  const stop = subscribePluginForeground(vi.fn());
  stop();
  finish?.(dispose);
  await Promise.resolve();
  expect(dispose).toHaveBeenCalledOnce();
});
