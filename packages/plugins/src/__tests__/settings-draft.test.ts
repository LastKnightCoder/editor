import { describe, expect, it, vi } from "vitest";
import { createSettingsDraftController, type SettingsDraftOptions } from "../settings-draft";

const options = (patch: Partial<SettingsDraftOptions> = {}) => {
  const save = vi.fn<() => Promise<string | void>>(async () => undefined);
  return { save, current: { dirty: true, save, reset: vi.fn(), ...patch } };
};

describe("设置草稿控制器", () => {
  it("跟随作者报告的状态，未接入时放行离开", async () => {
    const controller = createSettingsDraftController();
    expect(await controller.confirmLeave()).toBe(true);
    const source = options({ changes: [{ label: "身高", from: "176", to: "180" }] });
    const handle = controller.attach(source);
    expect(controller.getSnapshot()).toMatchObject({
      attached: true,
      dirty: true,
    });
    expect(controller.getSnapshot().changes).toHaveLength(1);
    source.current = { ...source.current, dirty: false };
    handle.update();
    expect(controller.getSnapshot()).toMatchObject({ dirty: false, changes: [] });
    expect(await controller.confirmLeave()).toBe(true);
    expect(() => controller.attach(options())).toThrow("一个设置分区只能有一个草稿");
    handle.dispose();
    expect(controller.getSnapshot().attached).toBe(false);
  });

  it("保存串行、成功后短暂显示结果，失败保留错误", async () => {
    vi.useFakeTimers();
    const controller = createSettingsDraftController({ savedDuration: 100 });
    let finish!: () => void;
    const save = vi.fn(() => new Promise<string>(resolve => (finish = () => resolve("连接正常"))));
    controller.attach(options({ save }));
    const first = controller.save();
    expect(controller.save()).toBe(first);
    expect(controller.getSnapshot().phase).toBe("saving");
    finish();
    expect(await first).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ phase: "saved", message: "连接正常" });
    vi.advanceTimersByTime(100);
    expect(controller.getSnapshot().phase).toBe("idle");
    save.mockRejectedValueOnce(new Error("数据库正忙"));
    expect(await controller.save()).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({ phase: "failed", message: "数据库正忙" });
    vi.useRealTimers();
  });

  it("有错误时不调用保存，交给作者标出字段", async () => {
    const controller = createSettingsDraftController();
    const source = options({ errors: 2, onInvalid: vi.fn() });
    controller.attach(source);
    expect(await controller.save()).toBe(false);
    expect(source.current.save).not.toHaveBeenCalled();
    expect(source.current.onInvalid).toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({ errors: 2, invalidAttempts: 1 });
  });

  it("离开确认的三种回答", async () => {
    const controller = createSettingsDraftController();
    const source = options();
    controller.attach(source);

    const stay = controller.confirmLeave();
    expect(controller.getSnapshot().leaving).toBe(true);
    controller.answerLeave("stay");
    expect(await stay).toBe(false);
    expect(controller.getSnapshot().leaving).toBe(false);

    const discard = controller.confirmLeave();
    controller.answerLeave("discard");
    expect(await discard).toBe(true);
    expect(source.current.reset).toHaveBeenCalled();

    source.save.mockRejectedValueOnce(new Error("失败"));
    const failed = controller.confirmLeave();
    controller.answerLeave("save");
    expect(await failed).toBe(false);
    const saved = controller.confirmLeave();
    controller.answerLeave("save");
    expect(await saved).toBe(true);
  });

  it("草稿卸载时放行等待中的离开", async () => {
    const controller = createSettingsDraftController();
    const handle = controller.attach(options());
    const leave = controller.confirmLeave();
    handle.dispose();
    expect(await leave).toBe(true);
  });
});

it("保存反馈保留展示时读取的语言，失败保留原始原因且不重复保存", async () => {
  vi.useFakeTimers();
  const controller = createSettingsDraftController({ savedDuration: 100 });
  let language = "first-language";
  const save = vi.fn(async () => ({
    get message() {
      return language;
    },
  }));
  const source = options({ save });
  const handle = controller.attach(source);
  try {
    expect(await controller.save()).toBe(true);
    const snapshot = controller.getSnapshot();
    expect(snapshot.phase).toBe("saved");
    expect(snapshot.feedback?.message).toBe("first-language");
    language = "next-language";
    source.current = { ...source.current, saveLabel: "translated action" };
    handle.update();
    expect(controller.getSnapshot().phase).toBe("saved");
    expect(snapshot.feedback?.message).toBe("next-language");
    expect(controller.getSnapshot().feedback?.message).toBe("next-language");
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(controller.getSnapshot().feedback).toBeUndefined();
    expect(controller.getSnapshot().phase).toBe("idle");
    expect(await controller.save()).toBe(true);
    source.current = { ...source.current, dirty: false };
    handle.update();
    expect(controller.getSnapshot().phase).toBe("saved");
    source.current = { ...source.current, dirty: true };
    handle.update();
    expect(controller.getSnapshot().phase).toBe("idle");
    expect(controller.getSnapshot().feedback).toBeUndefined();
    const failure = Object.assign(new Error("original diagnostic"), { code: "EXTERNAL_FAILURE" });
    save.mockRejectedValueOnce(failure);
    expect(await controller.save()).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({
      phase: "failed",
      message: "original diagnostic",
      failure,
    });
    controller.reset();
    expect(controller.getSnapshot().failure).toBeUndefined();
  } finally {
    controller.dispose();
    vi.useRealTimers();
  }
});
