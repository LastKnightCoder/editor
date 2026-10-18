// @vitest-environment node
import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { expect, it, vi } from "vitest";
import { PluginUploadRelay } from "../plugin-upload";
const window = (id: number) =>
  Object.assign(new EventEmitter(), {
    id,
    isDestroyed: () => false,
    send: vi.fn(),
  }) as unknown as WebContents;
const request = {
  pluginId: "test.upload",
  config: {},
  file: { name: "a.bin", mimeType: "application/octet-stream", content: new Uint8Array([0, 255]) },
};

it("多个主窗口各用自己的宿主，关闭另一宿主不取消自己的上传", async () => {
  const relay = new PluginUploadRelay(),
    first = window(1),
    second = window(2);
  relay.connect(first, "first");
  relay.connect(second, "second");
  const result = relay.upload(first, request);
  expect(first.send).toHaveBeenCalledTimes(1);
  expect(second.send).not.toHaveBeenCalled();
  relay.release(second.id);
  relay.reply(first.id, { ...vi.mocked(first.send).mock.calls[0][1], url: "https://files.test/a" });
  await expect(result).resolves.toBe("https://files.test/a");
});

it("独立窗口请求只交主窗口，拒绝其它窗口和旧代回复", async () => {
  const relay = new PluginUploadRelay();
  const host = window(1),
    caller = window(2);
  relay.connect(host, "generation");
  const result = relay.upload(caller, request);
  const message = vi.mocked(host.send).mock.calls[0][1];
  expect(message.file.content).toEqual(request.file.content);
  const done = vi.fn();
  void result.then(done);
  relay.reply(2, { ...message, url: "https://wrong.test/a" });
  relay.reply(1, { ...message, session: "old", url: "https://wrong.test/a" });
  await Promise.resolve();
  expect(done).not.toHaveBeenCalled();
  relay.reply(1, { ...message, url: "https://files.test/a" });
  await expect(result).resolves.toBe("https://files.test/a");
});

it.each(["destroyed", "did-navigate", "render-process-gone"])(
  "主窗口%s时拒绝所有在途，迟到回复不复活",
  async event => {
    const relay = new PluginUploadRelay(),
      host = window(1);
    relay.connect(host, "old");
    const result = relay.upload(window(2), request);
    const assertion = expect(result).rejects.toThrow("已关闭");
    host.emit(event);
    await assertion;
    await expect(relay.upload(window(3), request)).rejects.toThrow("不可用");
  }
);

it("调用窗口关闭只释放自己的请求，旧卸载不能注销新宿主", async () => {
  const relay = new PluginUploadRelay(),
    host = window(1),
    first = window(2);
  relay.connect(host, "new");
  relay.release(1, "old");
  const result = relay.upload(first, request);
  const assertion = expect(result).rejects.toThrow("已关闭");
  first.emit("destroyed");
  await assertion;
  const next = relay.upload(window(3), request);
  relay.reply(1, { ...vi.mocked(host.send).mock.calls[1][1], error: "服务商拒绝上传" });
  await expect(next).rejects.toThrow("服务商拒绝");
});
