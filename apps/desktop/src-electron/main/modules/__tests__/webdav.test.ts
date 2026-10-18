import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  put: vi.fn(async () => true),
  get: vi.fn(async () => Buffer.from([0, 255])),
  mkdir: vi.fn(async () => {}),
}));
vi.mock("electron", () => ({ ipcMain: { handle: mocks.handle } }));
vi.mock("webdav", () => ({
  createClient: () => ({
    createDirectory: mocks.mkdir,
    putFileContents: mocks.put,
    getFileContents: mocks.get,
  }),
}));
import webdav from "../webdav";
it("仅保留资源上传与下载IPC及原二进制行为", async () => {
  await webdav.init();
  expect(mocks.handle.mock.calls.map(([name]) => name)).toEqual([
    "webdav-upload",
    "webdav-download",
  ]);
  const info = {
    url: "https://example.test/dav",
    username: "user",
    password: "secret",
    remotePath: "/images/a.png",
  };
  expect(await webdav.upload({ ...info, file: new Uint8Array([0, 255]) })).toBe(
    "https://example.test/dav/images/a.png"
  );
  expect(mocks.mkdir).toHaveBeenCalledWith("/images", { recursive: true });
  expect(mocks.put).toHaveBeenCalledWith(info.remotePath, Buffer.from([0, 255]), {
    contentLength: 2,
    overwrite: true,
  });
  expect(await webdav.download(info)).toEqual(new Uint8Array([0, 255]));
});
