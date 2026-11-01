import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DesktopPluginRuntime } from "../runtime";

const mocks = vi.hoisted(() => ({
  status: vi.fn(async () => ({ pending: true, requiresPlugin: true })),
  migrate: vi.fn(async () => null),
  versions: vi.fn(async () => [
    { releaseId: "old", version: "0.1.0", compatible: true },
    { releaseId: "new", version: "0.2.0", compatible: true },
  ]),
  install: vi.fn<(id: string) => Promise<void>>(async () => undefined),
  notify: Object.assign(vi.fn(), { dismiss: vi.fn() }),
}));
vi.mock("@/commands/podcast-migration", () => ({
  getPodcastMigrationStatus: mocks.status,
  runPodcastMigration: mocks.migrate,
}));
vi.mock("@/commands/plugin-local", () => ({
  fetchPluginVersions: mocks.versions,
  stagePluginRelease: mocks.install,
}));
vi.mock("@/features/notifications/notify", () => ({ appNotify: mocks.notify }));

import { migratePodcastsToPlugin, PODCAST_PLUGIN_ID } from "../podcast-migration";

function setup(version: string | null = "0.2.0", output = true) {
  const state = { version, active: false, output };
  const local = {
    refresh: vi.fn(async () => undefined),
    owns: () => state.version !== null,
    enable: vi.fn(async () => {
      state.active = true;
    }),
    error: () => undefined,
  };
  const runtime = {
    local,
    host: {
      listPlugins: () => (state.version ? [{ id: PODCAST_PLUGIN_ID, version: state.version }] : []),
      getState: () => (state.active ? "active" : "disabled"),
    },
    findNotebookOutput: () => (state.active && state.output ? {} : undefined),
  } as unknown as DesktopPluginRuntime;
  return { runtime, local, state };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockResolvedValue({ pending: true, requiresPlugin: true });
  mocks.versions.mockResolvedValue([
    { releaseId: "old", version: "0.1.0", compatible: true },
    { releaseId: "new", version: "0.2.0", compatible: true },
  ]);
  mocks.install.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

it("没有待迁项目时不准备插件；只剩残留表时直接清理", async () => {
  const { runtime, local } = setup(null);
  mocks.status.mockResolvedValueOnce({ pending: false, requiresPlugin: false });
  await migratePodcastsToPlugin(runtime, "a", () => false);
  expect(mocks.migrate).not.toHaveBeenCalled();
  mocks.status.mockResolvedValueOnce({ pending: true, requiresPlugin: false });
  await migratePodcastsToPlugin(runtime, "a", () => false);
  expect(mocks.migrate).toHaveBeenCalledWith("a");
  expect(local.refresh).not.toHaveBeenCalled();
  expect(local.enable).not.toHaveBeenCalled();
  expect(mocks.install).not.toHaveBeenCalled();
});

it("已安装新版并声明 Notebook 输出时无需访问插件中心", async () => {
  const { runtime, local } = setup();
  await migratePodcastsToPlugin(runtime, "a", () => false);
  expect(local.enable).toHaveBeenCalledWith(PODCAST_PLUGIN_ID);
  expect(mocks.versions).not.toHaveBeenCalled();
  expect(mocks.migrate).toHaveBeenCalledWith("a");
});

it("已安装旧版时只选择支持 Notebook 的兼容版本，升级就绪后迁移", async () => {
  const { runtime, state } = setup("0.1.0");
  mocks.install.mockImplementationOnce(async () => {
    state.version = "0.2.0";
  });
  await migratePodcastsToPlugin(runtime, "a", () => false);
  expect(mocks.install).toHaveBeenCalledWith("new");
  expect(mocks.migrate).toHaveBeenCalledWith("a");
});

it("插件中心只有旧版时保留旧数据并提供重试通知", async () => {
  const { runtime } = setup("0.1.0");
  mocks.versions.mockResolvedValueOnce([{ releaseId: "old", version: "0.1.0", compatible: true }]);
  await migratePodcastsToPlugin(runtime, "a", () => false);
  expect(mocks.install).not.toHaveBeenCalled();
  expect(mocks.migrate).not.toHaveBeenCalled();
  expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ sticky: true }));
});

it("插件激活但未声明 Notebook 输出时仍禁止迁移", async () => {
  const { runtime } = setup("0.2.0", false);
  await migratePodcastsToPlugin(runtime, "a", () => false);
  expect(mocks.migrate).not.toHaveBeenCalled();
  expect(mocks.notify).toHaveBeenCalledWith(
    expect.objectContaining({
      body: expect.stringContaining("尚未支持 Notebook 输出"),
    })
  );
});

it("准备插件期间切库后不再启用或迁移", async () => {
  const { runtime, local } = setup();
  let cancelled = false;
  local.refresh.mockImplementationOnce(async () => {
    cancelled = true;
  });
  await migratePodcastsToPlugin(runtime, "a", () => cancelled);
  expect(local.enable).not.toHaveBeenCalled();
  expect(mocks.migrate).not.toHaveBeenCalled();
});
