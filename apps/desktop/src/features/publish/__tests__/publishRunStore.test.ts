import { beforeEach, expect, it, vi } from "vitest";
import { EPublishProvider } from "@/stores/useSettingStore";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (data: unknown) => void>(),
  resolvePublish: (_: unknown) => {},
  executePublish: vi.fn(),
  notify: vi.fn(),
  openPage: vi.fn(),
}));

vi.mock("@/stores/useBackendWebsocketStore", () => {
  const client = {
    registerNotificationHandler: (m: string, h: (d: unknown) => void) => mocks.handlers.set(m, h),
    unregisterNotificationHandler: (m: string) => mocks.handlers.delete(m),
  };
  const store = { getState: () => ({ client }), subscribe: () => () => {} };
  return { useBackendWebsocketStore: store };
});
vi.mock("@/commands", () => ({
  downloadPublishTemplate: vi.fn(async () => {}),
  executePublish: mocks.executePublish,
}));
vi.mock("@/commands/publish", () => ({ exportPublishOutput: vi.fn() }));
vi.mock("@tau/ui", () => ({ notify: mocks.notify }));
vi.mock("@/services/page-navigation", () => ({ openPage: mocks.openPage }));

type Notice = {
  title: string;
  body?: string;
  tone?: string;
  sticky?: boolean;
  actions?: { label: string; onClick?: () => unknown }[];
};
const lastNotice = () => mocks.notify.mock.calls.at(-1)?.[0] as Notice;

const { usePublishRunStore } = await import("../publishRunStore");

const params = {
  active: EPublishProvider.Github,
  providerConfig: { basePath: "/" },
  publish: { site: {}, local: { basePath: "/" } },
  appearance: {},
} as unknown as Parameters<ReturnType<typeof usePublishRunStore.getState>["start"]>[0];

beforeEach(() => {
  usePublishRunStore.setState({ run: { kind: "idle" }, finishSeq: 0 });
  mocks.executePublish.mockReset();
  mocks.executePublish.mockImplementation(
    () => new Promise(resolve => (mocks.resolvePublish = resolve))
  );
  mocks.notify.mockReset();
  mocks.openPage.mockReset();
});

it("发布中再次 start 被忽略，进度经常驻 handler 写入", async () => {
  const first = usePublishRunStore.getState().start(params);
  await vi.waitFor(() => expect(mocks.executePublish).toHaveBeenCalledTimes(1));
  expect(usePublishRunStore.getState().run.kind).toBe("running");

  await usePublishRunStore.getState().start(params);
  expect(mocks.executePublish).toHaveBeenCalledTimes(1);

  mocks.handlers.get("publish-progress")?.({ phase: "pushing", current: 2, total: 4 });
  const run = usePublishRunStore.getState().run;
  expect(run.kind === "running" && run.progress?.phase).toBe("pushing");

  usePublishRunStore.getState().reset();
  expect(usePublishRunStore.getState().run.kind).toBe("running");

  mocks.resolvePublish({ success: true, uploaded: ["a"], failed: [], deleted: [], skipped: [] });
  await first;
  expect(usePublishRunStore.getState().run.kind).toBe("done");
  expect(usePublishRunStore.getState().finishSeq).toBe(1);
  expect(lastNotice()).toMatchObject({ title: "站点已发布", tone: "ok" });
  expect(lastNotice().sticky).toBeFalsy();
});

it("部分失败与异常：常驻 danger 通知，异常转 error 态", async () => {
  mocks.executePublish.mockResolvedValueOnce({
    success: false,
    uploaded: [],
    failed: [{ path: "b", error: "x" }],
    deleted: [],
    skipped: [],
  });
  await usePublishRunStore.getState().start(params);
  expect(lastNotice()).toMatchObject({
    title: "发布完成，部分文件失败",
    tone: "danger",
    sticky: true,
  });

  mocks.executePublish.mockRejectedValueOnce(new Error("boom"));
  await usePublishRunStore.getState().start(params);
  expect(usePublishRunStore.getState().run).toEqual({ kind: "error", message: "boom" });
  expect(lastNotice()).toMatchObject({
    title: "发布失败",
    body: "boom",
    tone: "danger",
    sticky: true,
  });
});

it("失败通知：重试按上次参数重跑，查看详情打开发布页", async () => {
  mocks.executePublish.mockRejectedValueOnce(new Error("boom"));
  await usePublishRunStore.getState().start(params);
  const actions = lastNotice().actions ?? [];
  const click = (label: string) => actions.find(a => a.label === label)?.onClick?.();

  click("查看详情");
  expect(mocks.openPage).toHaveBeenCalledWith("publish");

  mocks.executePublish.mockResolvedValueOnce({
    success: true,
    uploaded: ["a"],
    failed: [],
    deleted: [],
    skipped: [],
  });
  click("重试");
  await vi.waitFor(() => expect(usePublishRunStore.getState().run.kind).toBe("done"));
  expect(mocks.executePublish).toHaveBeenLastCalledWith(
    expect.objectContaining({ providerType: params.active })
  );
  expect(lastNotice().title).toBe("站点已发布");
});
