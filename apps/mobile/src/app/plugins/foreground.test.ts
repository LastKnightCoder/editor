import { afterEach, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { subscribePluginForeground, connectPluginForeground } from "./foreground";
import { APP_FOREGROUND_EVENT } from "@tau/plugins/environment-host";

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
  window.dispatchEvent(new Event(APP_FOREGROUND_EVENT));
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
  const stop = connectPluginForeground({ notifyForeground: vi.fn(), notifyBackground: vi.fn() });
  stop();
  finish?.(dispose);
  await Promise.resolve();
  expect(dispose).toHaveBeenCalledOnce();
});

it("原生恢复与焦点使用通用源，停用后的迟到回调不再发送", async () => {
  const handlers = new Map<string, () => void>();
  vi.mocked(listen).mockImplementation(async (name, handler) => {
    handlers.set(String(name), () => handler({ event: String(name), id: 1, payload: undefined }));
    return vi.fn();
  });
  const source = { notifyForeground: vi.fn(), notifyBackground: vi.fn() };
  const stop = connectPluginForeground(source);
  await Promise.resolve();
  handlers.get("app-foreground")?.();
  handlers.get("tauri://focus")?.();
  handlers.get("tauri://blur")?.();
  expect(source.notifyForeground.mock.calls).toEqual([[], [false]]);
  expect(source.notifyBackground).toHaveBeenCalledTimes(1);
  stop();
  handlers.get("app-foreground")?.();
  expect(source.notifyForeground).toHaveBeenCalledTimes(2);
});
