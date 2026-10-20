import { describe, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext, type PluginNotificationOptions } from "../index";
import { createMemoryStorage, PluginHost, type NotificationsAdapter } from "../host";

async function setup() {
  let context!: PluginContext;
  const dispose = vi.fn();
  const send = vi.fn<NotificationsAdapter["send"]>(() => ({ dispose }));
  const host = new PluginHost({
    workspaceId: "work",
    storage: createMemoryStorage(),
    notifications: { send },
  });
  host.registerTrusted(
    definePlugin({
      id: "example.notify",
      name: "提醒",
      version: "1.0.0",
      create: () => ({
        activate(ctx) {
          context = ctx;
        },
      }),
    })
  );
  await host.enable("example.notify");
  return { host, context, send, dispose };
}

describe("插件通知", () => {
  it("复制通知并默认自动分流，手动关闭与停用不会重复清理", async () => {
    const { host, context, send, dispose } = await setup();
    const input = { title: "完成", body: "已同步" };
    const handle = context.notifications.send(input);
    input.title = "被修改";
    expect(send.mock.calls[0][2]).toMatchObject({ title: "完成", mode: "auto", tone: "neutral" });
    expect(send.mock.calls[0][1]).toEqual({ id: "example.notify", name: "提醒" });
    await handle.dispose();
    await host.disable("example.notify");
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(() => context.notifications.send(input)).toThrow();
    await host.dispose();
  });

  it("按钮回调只在通知和激活有效时执行", async () => {
    const { host, context, send } = await setup();
    const onClick = vi.fn();
    const handle = context.notifications.send({
      title: "处理",
      mode: "system",
      actions: [{ label: "打开", onClick }],
    });
    const action = send.mock.calls[0][2].actions?.[0];
    if (!action) throw new Error("缺少通知按钮");
    await action.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
    await handle.dispose();
    await expect(action.onClick()).rejects.toThrow("通知已失效");
    context.notifications.send({ title: "另一条", actions: [{ label: "打开", onClick }] });
    const nextAction = send.mock.calls[1][2].actions?.[0];
    if (!nextAction) throw new Error("缺少通知按钮");
    await host.disable("example.notify");
    await expect(nextAction.onClick()).rejects.toThrow();
    expect(onClick).toHaveBeenCalledTimes(1);
    await host.dispose();
  });

  it("无效内容在调用宿主前拒绝", async () => {
    const { host, context, send } = await setup();
    for (const options of [
      { title: "" },
      { title: "通知", mode: "other" },
      { title: "通知", tone: "other" },
      { title: "通知", sticky: "yes" },
      { title: "通知", actions: [{ label: "打开" }] },
      { title: "通知", actions: new Array(3).fill({ label: "打开", onClick: vi.fn() }) },
    ]) {
      expect(() => context.notifications.send(options as PluginNotificationOptions)).toThrow();
    }
    expect(send).not.toHaveBeenCalled();
    await host.dispose();
  });

  it("激活失败回收已发送的通知", async () => {
    const dispose = vi.fn();
    const host = new PluginHost({
      workspaceId: "work",
      storage: createMemoryStorage(),
      notifications: { send: () => ({ dispose }) },
    });
    host.registerTrusted(
      definePlugin({
        id: "example.fail",
        name: "失败",
        version: "1.0.0",
        create: () => ({
          activate(context) {
            context.notifications.send({ title: "开始" });
            throw new Error("激活失败");
          },
        }),
      })
    );
    await expect(host.enable("example.fail")).rejects.toThrow("激活失败");
    expect(dispose).toHaveBeenCalledTimes(1);
    await host.dispose();
  });
});
