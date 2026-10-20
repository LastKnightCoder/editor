import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginContext, PluginNotificationMode } from "@tau/plugins";

const mocks = vi.hoisted(() => ({
  notify: Object.assign(
    vi.fn(() => crypto.randomUUID()),
    { dismiss: vi.fn() }
  ),
}));
vi.mock("@/features/notifications/notify", () => ({ appNotify: mocks.notify }));
import { desktopPluginNotifications } from "../notifications";

beforeEach(() => vi.clearAllMocks());

describe("桌面插件通知", () => {
  it.each(["auto", "in-app", "system"] as PluginNotificationMode[])(
    "转接 %s 模式及插件来源",
    mode => {
      const controller = new AbortController();
      const context = { signal: controller.signal } as PluginContext;
      desktopPluginNotifications.send(
        context,
        { id: "sample", name: "示例插件" },
        {
          title: "完成",
          mode,
        }
      );
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ title: "完成", source: "示例插件" }),
        mode === "auto" ? undefined : { force: mode }
      );
      controller.abort();
      expect(mocks.notify.dismiss).toHaveBeenCalledWith(mocks.notify.mock.results[0].value);
    }
  );

  it("每次发送持有独立句柄，旧激活无法发送", () => {
    const controller = new AbortController();
    const context = { signal: controller.signal } as PluginContext;
    const owner = { id: "sample", name: "示例插件" };
    const first = desktopPluginNotifications.send(context, owner, { title: "第一条" });
    desktopPluginNotifications.send(context, owner, { title: "第二条" });
    first.dispose();
    expect(mocks.notify.dismiss.mock.calls).toEqual([[mocks.notify.mock.results[0].value]]);
    controller.abort();
    expect(mocks.notify.dismiss.mock.calls).toEqual([
      [mocks.notify.mock.results[0].value],
      [mocks.notify.mock.results[1].value],
    ]);
    expect(() => desktopPluginNotifications.send(context, owner, { title: "迟到" })).toThrow();
    expect(mocks.notify).toHaveBeenCalledTimes(2);
  });
});
