import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SystemNotificationPayload } from "@tau/platform";
import { NOTIFICATION_ICONS } from "../icons";

const mocks = vi.hoisted(() => {
  const notify = Object.assign(
    vi.fn((_options: unknown) => "nid"),
    {
      update: vi.fn(),
      dismiss: vi.fn(),
      isActive: vi.fn((): boolean => false),
    }
  );
  return {
    notify,
    route: vi.fn(
      async (_payload: SystemNotificationPayload): Promise<"in-app" | "system"> => "in-app"
    ),
    platformDismiss: vi.fn(async (_id: string) => {}),
  };
});

vi.mock("@tau/ui", () => ({ notify: mocks.notify }));
vi.mock("@/platform", () => ({
  platform: { notification: { route: mocks.route, dismiss: mocks.platformDismiss } },
}));

// notify.ts 的登记表是模块级状态：每个用例重置模块拿全新登记表
let appNotify: typeof import("../notify").appNotify;
let runLocal: typeof import("../notify").runLocal;

const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  ({ appNotify, runLocal } = await import("../notify"));
});

describe("appNotify 分流", () => {
  it("route 判 in-app：本窗口入栈，icon 键换组件，按钮直连原 onClick", async () => {
    const onClick = vi.fn();
    appNotify({
      id: "in-app-1",
      title: "标题",
      icon: "rotateCw",
      actions: [{ label: "去处理", onClick }],
    });
    await flush();

    expect(mocks.route).toHaveBeenCalledTimes(1);
    const payload = mocks.route.mock.calls[0]![0];
    expect(payload).toMatchObject({ id: "in-app-1", title: "标题", icon: "rotateCw" });
    expect(payload.actions).toEqual([{ label: "去处理" }]);
    expect(payload.timestamp).toBeTypeOf("number");

    expect(mocks.notify).toHaveBeenCalledTimes(1);
    const options = mocks.notify.mock.calls[0]![0] as {
      icon?: unknown;
      actions: { onClick: () => void }[];
    };
    expect(options.icon).toBe(NOTIFICATION_ICONS.rotateCw);
    expect(options.actions[0].onClick).toBe(onClick);
    options.actions[0].onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("route 判 system：主进程已推送，本窗口不再入栈", async () => {
    mocks.route.mockResolvedValueOnce("system");
    appNotify({ id: "system-1", title: "后台事件" });
    await flush();

    expect(mocks.route).toHaveBeenCalledTimes(1);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("force system：route 收到 force 参数，本端不入栈", async () => {
    mocks.route.mockResolvedValueOnce("system");
    appNotify({ id: "forced-1", title: "调试" }, { force: "system" });
    await flush();

    expect(mocks.route).toHaveBeenCalledWith(expect.objectContaining({ id: "forced-1" }), {
      force: "system",
    });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("本窗口栈里已有同 id：不路由，同步原位更新", () => {
    mocks.notify.isActive.mockReturnValueOnce(true);
    const onClick = vi.fn();
    appNotify({
      id: "active-1",
      title: "改标题",
      icon: "rocket",
      actions: [{ label: "看", onClick }],
    });

    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify.mock.calls[0]![0]).toMatchObject({
      id: "active-1",
      icon: NOTIFICATION_ICONS.rocket,
    });
    expect(mocks.route).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("id 缺省时自动生成并用于路由", async () => {
    const id = appNotify({ title: "匿名" });
    expect(id).toBeTruthy();
    await flush();
    expect(mocks.route.mock.calls[0]![0].id).toBe(id);
  });

  it("route 未落定期间被 dismiss：裁决回来不再入栈", async () => {
    let settleRoute!: (route: "in-app" | "system") => void;
    mocks.route.mockImplementationOnce(() => new Promise(resolve => (settleRoute = resolve)));
    appNotify({ id: "race-1", title: "x" });
    appNotify.dismiss("race-1");
    settleRoute("in-app");
    await flush();

    expect(mocks.notify).not.toHaveBeenCalled();
  });
});

describe("appNotify.dismiss", () => {
  it("关闭一条：本地与系统窗口两侧关闭，并清理按钮登记", async () => {
    const onClick = vi.fn();
    appNotify({ id: "gone-1", title: "x", actions: [{ label: "做", onClick }] });
    await flush();

    appNotify.dismiss("gone-1");
    expect(mocks.notify.dismiss).toHaveBeenCalledWith("gone-1");
    expect(mocks.platformDismiss).toHaveBeenCalledWith("gone-1");
    await expect(runLocal("gone-1", 0)).rejects.toThrow("通知已失效");
  });

  it("不传 id：本地全关并逐个撤销已路由的通知", async () => {
    appNotify({ id: "bulk-1", title: "a" });
    appNotify({ id: "bulk-2", title: "b" });
    await flush();

    appNotify.dismiss();
    expect(mocks.notify.dismiss).toHaveBeenCalledWith(undefined);
    expect(mocks.platformDismiss.mock.calls.map(call => call[0])).toEqual(["bulk-1", "bulk-2"]);
  });
});

describe("appNotify.update", () => {
  it("本地在栈：notify.update 原位改", () => {
    mocks.notify.isActive.mockReturnValueOnce(true);
    appNotify({ id: "upd-1", title: "初版", body: "旧" });

    mocks.notify.isActive.mockReturnValueOnce(true);
    appNotify.update("upd-1", { title: "新版" });

    expect(mocks.notify.update).toHaveBeenCalledWith(
      "upd-1",
      expect.objectContaining({ title: "新版" })
    );
    expect(mocks.route).not.toHaveBeenCalled();
  });

  it("本端不在栈（已路由 system）：合并上次 options 后重发同 id", async () => {
    mocks.route.mockResolvedValue("system");
    appNotify({
      id: "upd-2",
      title: "初版",
      sticky: true,
      actions: [{ label: "去", onClick: () => {} }],
    });
    await flush();

    appNotify.update("upd-2", { title: "新版" });
    expect(mocks.route).toHaveBeenCalledTimes(2);
    expect(mocks.route.mock.calls[1]![0]).toMatchObject({
      id: "upd-2",
      title: "新版",
      sticky: true,
    });
    expect(mocks.route.mock.calls[1]![0].actions).toEqual([{ label: "去" }]);
  });

  it("未知 id（未经过 appNotify / 已 dismiss）：无操作", () => {
    appNotify.update("nope", { title: "x" });
    expect(mocks.route).not.toHaveBeenCalled();
    expect(mocks.notify.update).not.toHaveBeenCalled();
  });
});

describe("runLocal", () => {
  it("执行登记的按钮 onClick 并返回 promise", async () => {
    const onClick = vi.fn(async () => "ok");
    appNotify({ id: "run-1", title: "x", actions: [{ label: "做", onClick }, { label: "闲" }] });
    await expect(runLocal("run-1", 0)).resolves.toBeUndefined();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("未知 id 拒绝并给出「通知已失效」", async () => {
    await expect(runLocal("unknown", 0)).rejects.toThrow("通知已失效");
  });

  it("按钮同步抛错转为 reject", async () => {
    appNotify({
      id: "throw-1",
      title: "x",
      actions: [
        {
          label: "炸",
          onClick: () => {
            throw new Error("boom");
          },
        },
      ],
    });
    await expect(runLocal("throw-1", 0)).rejects.toThrow("boom");
  });
});
