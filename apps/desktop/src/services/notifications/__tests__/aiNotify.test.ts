// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appNotify: Object.assign(
    vi.fn(
      (opts: { id?: string; actions?: Array<{ onClick?: () => unknown }> }) =>
        opts.id ?? "generated-id"
    ),
    { dismiss: vi.fn(), update: vi.fn() }
  ),
  activeDb: "main.db",
  settingsOpen: false,
  closeSettings: vi.fn(),
  settingsSection: "general",
  currentPage: { key: "home", params: {} as Record<string, unknown> },
}));

vi.mock("../notify", () => ({ appNotify: mocks.appNotify }));
vi.mock("@/stores/useSettingStore", () => ({
  default: {
    getState: () => ({ setting: { database: { active: mocks.activeDb } } }),
  },
}));
vi.mock("@/app/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({
      open: mocks.settingsOpen,
      section: mocks.settingsSection,
      closeSettings: mocks.closeSettings,
    }),
  },
}));
vi.mock("@/services/page-navigation", () => ({
  getPageNavigation: () => ({
    state: { back: [mocks.currentPage], forward: [] },
  }),
}));

import {
  dismissAiNotice,
  dismissAiNoticesByPrefix,
  dismissAllAiNotices,
  isSurfaceActive,
  isViewingPage,
  notifyAiTask,
  registerActiveSurface,
  resetAiNotifyState,
} from "../aiNotify";

function setDocumentAttended(attended: boolean) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: attended ? "visible" : "hidden",
  });
  vi.spyOn(document, "hasFocus").mockReturnValue(attended);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAiNotifyState();
  mocks.activeDb = "main.db";
  mocks.settingsOpen = false;
  mocks.settingsSection = "general";
  mocks.currentPage = { key: "home", params: {} };
  setDocumentAttended(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notifyAiTask 三态分流与可见面抑制", () => {
  it("窗口聚焦且处于任务可见面时抑制不发", () => {
    setDocumentAttended(true);
    const id = notifyAiTask({
      id: "task-1",
      title: "完成",
      isOnSurface: () => true,
    });
    expect(id).toBeNull();
    expect(mocks.appNotify).not.toHaveBeenCalled();
  });

  it("窗口聚焦但已离开可见面时发送通知", () => {
    setDocumentAttended(true);
    const id = notifyAiTask({
      id: "task-2",
      title: "完成",
      isOnSurface: () => false,
    });
    expect(id).toBe("task-2");
    expect(mocks.appNotify).toHaveBeenCalledTimes(1);
  });

  it("窗口失焦时即使仍在原可见面也发送通知", () => {
    setDocumentAttended(false);
    const id = notifyAiTask({
      id: "task-3",
      title: "完成",
      isOnSurface: () => true,
    });
    expect(id).toBe("task-3");
    expect(mocks.appNotify).toHaveBeenCalledTimes(1);
  });

  it("unfocused-only 模式在窗口聚焦时一律抑制，仅失焦时发送", () => {
    setDocumentAttended(true);
    expect(notifyAiTask({ id: "modal-1", title: "生图完成", mode: "unfocused-only" })).toBeNull();
    expect(mocks.appNotify).not.toHaveBeenCalled();

    setDocumentAttended(false);
    expect(notifyAiTask({ id: "modal-1", title: "生图完成", mode: "unfocused-only" })).toBe(
      "modal-1"
    );
    expect(mocks.appNotify).toHaveBeenCalledTimes(1);
  });
});

describe("耗时门槛与高优先豁免", () => {
  it("纯完成通知未达到 minElapsedMs 时抑制，达到后发送", () => {
    setDocumentAttended(false);
    expect(
      notifyAiTask({
        id: "fast",
        title: "已回复",
        tone: "ok",
        elapsedMs: 2000,
        minElapsedMs: 5000,
      })
    ).toBeNull();

    expect(
      notifyAiTask({
        id: "slow",
        title: "已回复",
        tone: "ok",
        elapsedMs: 6000,
        minElapsedMs: 5000,
      })
    ).toBe("slow");
  });

  it("sticky 等待交互与 danger 失败通知不受耗时门槛抑制", () => {
    setDocumentAttended(false);
    expect(
      notifyAiTask({
        id: "wait",
        title: "等待审批",
        sticky: true,
        elapsedMs: 200,
        minElapsedMs: 5000,
      })
    ).toBe("wait");
    expect(
      notifyAiTask({
        id: "fail",
        title: "请求失败",
        tone: "danger",
        elapsedMs: 200,
        minElapsedMs: 5000,
      })
    ).toBe("fail");
  });
});

describe("切库保护、可见面注册与批量回收", () => {
  it("reveal 动作在切库后拒绝执行，同库正常执行", () => {
    setDocumentAttended(false);
    mocks.activeDb = "work.db";
    const open = vi.fn();
    notifyAiTask({
      id: "nav-1",
      title: "完成",
      databaseName: "work.db",
      actions: [{ label: "查看", reveal: true, onClick: open }],
    });
    const passedAction = mocks.appNotify.mock.calls[0]?.[0].actions?.[0]?.onClick as () => void;

    mocks.activeDb = "other.db";
    expect(() => passedAction()).toThrow();
    expect(open).not.toHaveBeenCalled();

    mocks.activeDb = "work";
    passedAction();
    expect(open).toHaveBeenCalledTimes(1);
    expect(mocks.closeSettings).toHaveBeenCalledTimes(1);
  });

  it("旧库任务在切库后结束时不重新创建通知", () => {
    setDocumentAttended(false);
    mocks.activeDb = "other.db";
    const result = notifyAiTask({ title: "完成", databaseName: "work.db", sticky: true });
    expect(result).toBeNull();
    expect(mocks.appNotify).not.toHaveBeenCalled();
  });

  it("设置页打开时 isViewingPage 返回 false", () => {
    mocks.currentPage = { key: "chat", params: { id: "c1" } };
    expect(isViewingPage("chat", p => p.id === "c1")).toBe(true);
    mocks.settingsOpen = true;
    expect(isViewingPage("chat", p => p.id === "c1")).toBe(false);
  });

  it("引用计数型 surface 注册与按前缀撤销通知", () => {
    const off1 = registerActiveSurface("chat:a");
    const off2 = registerActiveSurface("chat:a");
    expect(isSurfaceActive("chat:a")).toBe(true);
    off1();
    expect(isSurfaceActive("chat:a")).toBe(true);
    off2();
    expect(isSurfaceActive("chat:a")).toBe(false);

    setDocumentAttended(false);
    notifyAiTask({ id: "approval:1", title: "a", sticky: true });
    notifyAiTask({ id: "approval:2", title: "b", sticky: true });
    notifyAiTask({ id: "vl:1", title: "c" });

    dismissAiNoticesByPrefix("approval:");
    expect(mocks.appNotify.dismiss).toHaveBeenCalledWith("approval:1");
    expect(mocks.appNotify.dismiss).toHaveBeenCalledWith("approval:2");
    expect(mocks.appNotify.dismiss).not.toHaveBeenCalledWith("vl:1");

    dismissAiNotice("vl:1");
    expect(mocks.appNotify.dismiss).toHaveBeenCalledWith("vl:1");

    notifyAiTask({ id: "other:1", title: "d" });
    dismissAllAiNotices();
    expect(mocks.appNotify.dismiss).toHaveBeenCalledWith("other:1");
  });
});
