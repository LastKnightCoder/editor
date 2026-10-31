import { expect, it, vi } from "vitest";
import { connectCollaborationImageStorage } from "../collaboration-image-storage";

const host = vi.hoisted(() => ({
  ready: false,
  listeners: new Map<string, (...args: any[]) => any>(),
  connect: vi.fn<(session: string) => Promise<void>>(async () => {}),
  release: vi.fn(async () => {}),
  reply: vi.fn(async () => {}),
  upload: vi.fn(async () => "https://owner.test/compressed.webp"),
}));
vi.mock("@/electron", () => ({
  isElectron: true,
  on: (channel: string, listener: (...args: any[]) => any) => host.listeners.set(channel, listener),
  off: (channel: string) => host.listeners.delete(channel),
}));
vi.mock("@/commands/module-init", () => ({
  withModule: (_name: string, run: () => Promise<void>) => run(),
}));
vi.mock("@/hooks/useUploadResource", () => ({ uploadResource: host.upload }));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ inited: host.ready }) },
}));
vi.mock("@/commands/contracts/collaboration", () => ({
  collaborationCommands: {
    ownerImageConnect: { call: host.connect },
    ownerImageRelease: { call: host.release },
    ownerImageReply: { call: host.reply },
  },
}));

it("收到的图片交给作者常规上传流程，返回持久地址且释放时注销宿主", async () => {
  const stop = connectCollaborationImageStorage();
  const hostSession = host.connect.mock.calls[0][0];
  const receive = host.listeners.get("collaboration:owner-image-store")!;
  try {
    await receive(undefined, { requestId: "stale", hostSession: "old", file: {} });
    expect(host.upload).not.toHaveBeenCalled();
    await receive(undefined, { requestId: "waiting", hostSession, file: {} });
    expect(host.upload).not.toHaveBeenCalled();
    expect(host.reply).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "waiting", error: "作者的存储配置尚未加载完成" })
    );
    host.ready = true;
    await receive(undefined, {
      requestId: "member",
      hostSession,
      file: { name: "member.png", mime: "image/png", bytes: new Uint8Array([0, 255]) },
    });
    expect(host.upload).toHaveBeenCalledWith(
      expect.objectContaining({ name: "member.png", type: "image/png", size: 2 }),
      expect.any(AbortSignal)
    );
    expect(host.reply).toHaveBeenCalledWith({
      requestId: "member",
      hostSession,
      reference: "https://owner.test/compressed.webp",
    });
  } finally {
    stop();
    await Promise.resolve();
  }
  expect(host.release).toHaveBeenCalledWith(hostSession);
  expect(host.listeners.size).toBe(0);
});
