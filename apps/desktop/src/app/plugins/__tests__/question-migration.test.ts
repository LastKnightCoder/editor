import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pending: vi.fn(async () => true),
  run: vi.fn(async () => ({ questions: 1, answers: 0, groups: 1, links: 0, events: 1 })),
  versions: vi.fn(async () => [
    { releaseId: "r-new", compatible: false },
    { releaseId: "r-ok", compatible: true },
  ]),
  stage: vi.fn(async () => ({ id: "tau.questions", version: "0.1.0" })),
  notify: Object.assign(vi.fn(), { dismiss: vi.fn() }),
}));

vi.mock("@/commands/question-migration", () => ({
  hasPendingQuestionMigration: mocks.pending,
  runQuestionMigration: mocks.run,
}));
vi.mock("@/commands/plugin-local", () => ({
  fetchPluginVersions: mocks.versions,
  stagePluginRelease: mocks.stage,
}));
vi.mock("@/features/notifications/notify", () => ({ appNotify: mocks.notify }));

import { migrateQuestionsToPlugin } from "../question-migration";

function runtime(options: { installed: boolean; active?: boolean }) {
  let installed = options.installed;
  let state = options.active ? "active" : "inactive";
  const calls: string[] = [];
  const local = {
    refresh: vi.fn(async () => {
      calls.push("refresh");
    }),
    owns: () => installed,
    enable: vi.fn(async () => {
      calls.push("enable");
      state = "active";
    }),
    error: () => undefined,
  };
  mocks.stage.mockImplementation(async () => {
    calls.push("stage");
    installed = true;
    return { id: "tau.questions", version: "0.1.0" };
  });
  mocks.run.mockImplementation(async () => {
    calls.push("run");
    return { questions: 1, answers: 0, groups: 1, links: 0, events: 1 };
  });
  return {
    calls,
    local,
    runtime: { local, host: { getState: () => state } } as never,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pending.mockResolvedValue(true);
});

describe("问题管理迁入插件", () => {
  it("没有旧数据时不安装也不迁", async () => {
    mocks.pending.mockResolvedValue(false);
    const { runtime: rt, calls } = runtime({ installed: false });
    await migrateQuestionsToPlugin(rt, "main", () => false);
    expect(calls).toEqual([]);
    expect(mocks.versions).not.toHaveBeenCalled();
  });

  it("没装时按插件 ID 装最新的兼容版本，启用激活后再迁", async () => {
    const { runtime: rt, calls } = runtime({ installed: false });
    await migrateQuestionsToPlugin(rt, "main", () => false);
    expect(mocks.versions).toHaveBeenCalledWith("tau.questions");
    expect(mocks.stage).toHaveBeenCalledWith("r-ok");
    expect(calls).toEqual(["refresh", "stage", "refresh", "enable", "run"]);
    expect(mocks.run).toHaveBeenCalledWith("main");
    expect(mocks.notify.dismiss).toHaveBeenCalled();
  });

  it("已装并启用时直接迁", async () => {
    const { runtime: rt, calls } = runtime({ installed: true, active: true });
    await migrateQuestionsToPlugin(rt, "main", () => false);
    expect(calls).toEqual(["refresh", "run"]);
  });

  it("离线等失败时不迁，弹可重试的通知；重试成功后撤下通知", async () => {
    mocks.versions.mockRejectedValueOnce(
      new Error("Error invoking remote method 'plugin-local:versions': Error: 暂时连不上插件中心")
    );
    const { runtime: rt, calls } = runtime({ installed: false });
    await migrateQuestionsToPlugin(rt, "main", () => false);
    expect(calls).not.toContain("run");
    const options = mocks.notify.mock.calls[0][0];
    expect(options).toMatchObject({ id: "question-plugin-migration", sticky: true });
    expect(options.body).toContain("原因：暂时连不上插件中心");
    await options.actions[0].onClick();
    expect(calls).toContain("run");
    expect(mocks.notify.dismiss).toHaveBeenCalledWith("question-plugin-migration");
  });

  it("切库后中止，不迁也不提示", async () => {
    const { runtime: rt, calls } = runtime({ installed: true, active: true });
    await migrateQuestionsToPlugin(rt, "main", () => true);
    expect(calls).toEqual([]);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
