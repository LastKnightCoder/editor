import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** 系统通知 mock 的契约：全部 force 直发系统窗口、id 带 debug- 前缀、时序正确 */

const mocks = vi.hoisted(() => {
  const appNotify = Object.assign(
    vi.fn((_options: unknown, _route?: unknown) => "debug-id"),
    {
      update: vi.fn(),
      dismiss: vi.fn(),
    }
  );
  return { appNotify };
});

vi.mock("../notify", () => ({ appNotify: mocks.appNotify }));

import {
  dismissAllNotifications,
  runProgressUpdateSequence,
  scheduleRealRouteTest,
  sendAvatarNotification,
  sendBurstNotifications,
  sendDangerNotification,
  sendOkNotification,
  sendPlainNotification,
} from "../debug/systemNotificationMocks";

interface MockCall {
  id: string;
  title: string;
  routeOptions: { force?: string } | undefined;
}

const calls = (): MockCall[] =>
  mocks.appNotify.mock.calls.map(([options, routeOptions]) => ({
    id: (options as { id: string }).id,
    title: (options as { title: string }).title,
    routeOptions: routeOptions as { force?: string } | undefined,
  }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.clearAllTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("单条 mock", () => {
  it("纯告知：force system，id 带 debug- 前缀，icon bell", () => {
    sendPlainNotification();
    expect(calls()).toHaveLength(1);
    const [call] = calls();
    expect(call.id).toMatch(/^debug-/);
    expect(call.title).toBe("这是一条纯告知通知");
    expect(call.routeOptions).toEqual({ force: "system" });
  });

  it("成功 / 失败 / 人物作答：均 force system", () => {
    sendOkNotification();
    sendDangerNotification();
    sendAvatarNotification();
    expect(calls().map(call => call.title)).toEqual([
      "发布完成",
      "发布失败",
      "林同学 请求加入协作",
    ]);
    expect(calls().map(call => call.routeOptions)).toEqual([
      { force: "system" },
      { force: "system" },
      { force: "system" },
    ]);
  });
});

describe("时序 mock", () => {
  it("连发 5 条：间隔 150ms，标题各不相同，id 互异", () => {
    sendBurstNotifications();
    expect(mocks.appNotify).not.toHaveBeenCalled();

    // 第 1 条 delay 为 0，随后每 150ms 一条
    vi.advanceTimersByTime(1);
    expect(mocks.appNotify).toHaveBeenCalledTimes(1);
    for (let i = 2; i <= 5; i++) {
      vi.advanceTimersByTime(150);
      expect(mocks.appNotify).toHaveBeenCalledTimes(i);
    }
    const sent = calls();
    expect(new Set(sent.map(call => call.id)).size).toBe(5);
    expect(new Set(sent.map(call => call.title)).size).toBe(5);
  });

  it("原位更新：固定 id debug-progress，30% → 80% → 完成带按钮", () => {
    runProgressUpdateSequence();
    expect(calls()).toHaveLength(1);
    expect(calls()[0]).toMatchObject({ id: "debug-progress", title: "正在下载更新" });

    vi.advanceTimersByTime(1500);
    expect(mocks.appNotify.update).toHaveBeenCalledWith("debug-progress", {
      body: "已完成 80%",
    });

    vi.advanceTimersByTime(1500);
    expect(mocks.appNotify.update).toHaveBeenCalledTimes(2);
    const finalPatch = mocks.appNotify.update.mock.calls[1]![1] as { title: string };
    expect(finalPatch.title).toBe("更新已下载");
  });

  it("延迟 3 秒真实分流：到点才发且不传 force", () => {
    scheduleRealRouteTest();
    expect(mocks.appNotify).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3000);
    expect(calls()).toHaveLength(1);
    expect(calls()[0]!.routeOptions).toBeUndefined();
  });
});

describe("清除", () => {
  it("全部清除：appNotify.dismiss() 不传 id", () => {
    dismissAllNotifications();
    expect(mocks.appNotify.dismiss).toHaveBeenCalledWith();
  });
});
