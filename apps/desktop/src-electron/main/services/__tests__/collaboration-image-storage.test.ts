// @vitest-environment node
import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { expect, it, vi } from "vitest";
import { CollaborationImageStorage } from "../collaboration-image-storage";

const window = (id: number) =>
  Object.assign(new EventEmitter(), {
    id,
    isDestroyed: () => false,
    send: vi.fn(),
  }) as unknown as WebContents;
const file = { name: "member.png", mime: "image/png", bytes: new Uint8Array([0, 255]) };

it("作者图片只接受对应主窗口及当前代次的存储回执", async () => {
  const storage = new CollaborationImageStorage();
  const host = window(1);
  storage.connect(host, "current");
  const pending = storage.save(file);
  const message = vi.mocked(host.send).mock.calls[0][1];
  const done = vi.fn();
  void pending.then(done);
  storage.reply(2, { ...message, reference: "https://wrong.test/image.webp" });
  storage.reply(1, { ...message, hostSession: "old", reference: "https://wrong.test/image.webp" });
  await Promise.resolve();
  expect(done).not.toHaveBeenCalled();
  storage.reply(1, { ...message, reference: "https://owner.test/image.webp" });
  await expect(pending).resolves.toBe("https://owner.test/image.webp");
});

it("主窗口关闭使存储失败，迟到回执不覆盖重连后的结果", async () => {
  const storage = new CollaborationImageStorage();
  const host = window(1);
  await expect(storage.save(file)).rejects.toThrow("主窗口");
  storage.connect(host, "first");
  const pending = storage.save(file);
  const message = vi.mocked(host.send).mock.calls[0][1];
  const failed = expect(pending).rejects.toThrow("已关闭");
  host.emit("render-process-gone");
  await failed;
  storage.reply(1, { ...message, reference: "https://late.test/image.webp" });
  storage.connect(host, "second");
  storage.release(1, "first");
  const next = storage.save(file);
  const latest = vi.mocked(host.send).mock.calls.at(-1)![1];
  storage.reply(1, { ...latest, error: "作者图床连接失败" });
  await expect(next).rejects.toThrow("图床连接失败");
});
