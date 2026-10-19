// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: {}, webContents: {} }));
import { PluginPublishSessions, safePublishError } from "../plugin-publish-provider";

it("会话固定配置，拒绝其他窗口调用及发布期间插件替换", async () => {
  const send = vi.fn(async (_owner, request) =>
    request.kind === "open"
      ? { mode: "files", concurrency: 2 }
      : request.method === "describe"
        ? { identity: "target", basePath: "/blog/" }
        : true
  );
  const sessions = new PluginPublishSessions(async () => {}, send);
  const config = { token: "private-value" };
  const opened = await sessions.begin(1, "test.publisher", config);
  config.token = "changed";
  expect(send.mock.calls[0][1].config).toEqual({ token: "private-value" });
  await expect(sessions.call(2, opened.id, "checkConnection")).rejects.toThrow("不属于");
  await expect(sessions.protect("test.publisher", async () => {})).rejects.toThrow("发布任务");
  expect(await sessions.describe(1, opened.id)).toEqual({
    identity: "target",
    basePath: "/blog/",
    publicUrl: undefined,
  });
  await sessions.end(1, opened.id);
  expect(opened.signal.aborted).toBe(true);
  expect(sessions.busy).toBe(false);
  await expect(sessions.protect("test.publisher", async () => "ok")).resolves.toBe("ok");
});
it("窗口释放拒绝迟到回复，失败日志移除凭据", async () => {
  let finish!: (value: unknown) => void;
  const sessions = new PluginPublishSessions(
    async () => {},
    async (_owner, request) =>
      request.kind === "open"
        ? { mode: "files", concurrency: 1 }
        : new Promise(resolve => {
            finish = resolve;
          })
  );
  const opened = await sessions.begin(1, "test.publisher", {});
  const call = sessions.call(1, opened.id, "checkConnection");
  sessions.releaseOwner(1);
  finish(true);
  await expect(call).rejects.toThrow();
  expect(
    safePublishError(new Error("token=private-value"), { token: "private-value" }).message
  ).not.toContain("private-value");
});
