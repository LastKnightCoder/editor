import { beforeEach, expect, it, vi } from "vitest";
import { EPublishProvider } from "@/stores/useSettingStore";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (data: unknown) => void>(),
  resolvePublish: (_: unknown) => {},
  executePublish: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
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
vi.mock("@tau/ui", () => ({ toast: mocks.toast }));

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
  Object.values(mocks.toast).forEach(fn => fn.mockReset());
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
  expect(mocks.toast.success).toHaveBeenCalled();
});

it("部分失败 toast 警告，异常转 error 态", async () => {
  mocks.executePublish.mockResolvedValueOnce({
    success: false,
    uploaded: [],
    failed: [{ path: "b", error: "x" }],
    deleted: [],
    skipped: [],
  });
  await usePublishRunStore.getState().start(params);
  expect(mocks.toast.warning).toHaveBeenCalled();

  mocks.executePublish.mockRejectedValueOnce(new Error("boom"));
  await usePublishRunStore.getState().start(params);
  expect(usePublishRunStore.getState().run).toEqual({ kind: "error", message: "boom" });
  expect(mocks.toast.error).toHaveBeenCalledWith("发布失败：boom");
});
