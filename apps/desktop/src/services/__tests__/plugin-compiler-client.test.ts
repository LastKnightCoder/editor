import { beforeEach, expect, it, vi } from "vitest";
const bridge = vi.hoisted(() => ({ invoke: vi.fn(), on: vi.fn(), off: vi.fn() }));
vi.mock("@/electron", () => bridge);
vi.mock("@/commands/module-init", () => ({ ensureModule: vi.fn(async () => undefined) }));
import { invokeCompiler } from "../plugin-compiler-client";

beforeEach(() => vi.resetAllMocks());

it("等待 open 时取消仍关闭票据，不发送编译请求", async () => {
  let opened!: (id: string) => void;
  bridge.invoke.mockImplementation((channel: string) =>
    channel.endsWith(":open")
      ? new Promise(resolve => {
          opened = resolve;
        })
      : Promise.resolve()
  );
  const controller = new AbortController();
  const task = invokeCompiler(
    { kind: "tailwind", source: "p-4", language: "html" },
    { signal: controller.signal }
  );
  await vi.waitFor(() => expect(opened).toBeTypeOf("function"));
  controller.abort();
  opened("task-1");
  await expect(task).rejects.toMatchObject({ name: "AbortError" });
  expect(bridge.invoke.mock.calls.some(([channel]) => channel === "plugin-services:run")).toBe(
    false
  );
  expect(bridge.invoke).toHaveBeenCalledWith("plugin-services:close", "task-1");
  expect(bridge.off).toHaveBeenCalled();
});

it("运行中取消传到主进程，忽略迟到结果与其他任务的进度", async () => {
  let complete!: (value: unknown) => void;
  bridge.invoke.mockImplementation((channel: string) => {
    if (channel.endsWith(":open")) return Promise.resolve("task-1");
    if (channel.endsWith(":run"))
      return new Promise(resolve => {
        complete = resolve;
      });
    return Promise.resolve();
  });
  const controller = new AbortController();
  const progress = vi.fn();
  const task = invokeCompiler(
    { kind: "tailwind", source: "p-4", language: "html" },
    { signal: controller.signal, onProgress: progress }
  );
  await vi.waitFor(() => expect(complete).toBeTypeOf("function"));
  const listener = bridge.on.mock.calls[0][1];
  listener(undefined, "other", { time: 2 });
  expect(progress).not.toHaveBeenCalled();
  controller.abort();
  listener(undefined, "task-1", { time: 3 });
  complete({ ok: true, value: { css: "late" } });
  await expect(task).rejects.toMatchObject({ name: "AbortError" });
  expect(progress).not.toHaveBeenCalled();
  expect(bridge.invoke).toHaveBeenCalledWith("plugin-services:cancel", "task-1");
  expect(bridge.invoke).toHaveBeenCalledWith("plugin-services:close", "task-1");
});
