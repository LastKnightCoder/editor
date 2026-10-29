import { expect, it, vi } from "vitest";
import type { MobileAiService } from "../service";
import { bindMobileAiLifecycle } from "../lifecycle";

function owner() {
  const document = new EventTarget();
  const window = new EventTarget();
  let state = "visible";
  Object.defineProperties(document, {
    visibilityState: { get: () => state },
    defaultView: { value: window },
  });
  return {
    document: document as Document,
    window,
    state: (value: string) => {
      state = value;
    },
  };
}

it("可见性和页面生命周期只暂停/恢复服务，解绑不终止运行", async () => {
  const host = owner();
  const lifecycle = {
    suspend: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  };
  const unbind = bindMobileAiLifecycle({ lifecycle } as unknown as MobileAiService, host.document);
  expect(lifecycle.resume).toHaveBeenCalledTimes(1);
  host.state("hidden");
  host.document.dispatchEvent(new Event("visibilitychange"));
  host.window.dispatchEvent(new Event("pagehide"));
  expect(lifecycle.suspend).toHaveBeenCalledTimes(2);
  host.state("visible");
  host.window.dispatchEvent(new Event("pageshow"));
  expect(lifecycle.resume).toHaveBeenCalledTimes(2);
  unbind();
  host.state("hidden");
  host.document.dispatchEvent(new Event("visibilitychange"));
  expect(lifecycle.suspend).toHaveBeenCalledTimes(2);
  expect(lifecycle.dispose).not.toHaveBeenCalled();
});

it("生命周期收尾失败可被观察，观察者失败不会产生未处理拒绝", async () => {
  const host = owner();
  host.state("hidden");
  const error = new Error("关闭失败");
  const onError = vi.fn(() => {
    throw new Error("观察失败");
  });
  const unbind = bindMobileAiLifecycle(
    {
      lifecycle: { suspend: () => Promise.reject(error), resume: vi.fn() },
    } as unknown as MobileAiService,
    host.document,
    onError
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(onError).toHaveBeenCalledWith(error);
  unbind();
});
