import { beforeEach, describe, expect, it, vi } from "vitest";

const { putObjectMock, ossConstructorMock } = vi.hoisted(() => ({
  putObjectMock: vi.fn(),
  ossConstructorMock: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("ali-oss", () => ({
  default: ossConstructorMock.mockImplementation(() => ({
    put: putObjectMock,
  })),
}));

import AliOssModule from "../ali-oss";

describe("ali-oss", () => {
  beforeEach(() => {
    putObjectMock.mockReset();
    ossConstructorMock.mockClear();
  });

  it("同步退役后，资源上传仍使用原接口与5分钟超时", async () => {
    putObjectMock.mockResolvedValue({ url: "https://example.test/image.png" });

    const url = await AliOssModule.putObject({
      accessKeyId: "access-key-id",
      accessKeySecret: "access-key-secret",
      bucket: "backup-bucket",
      region: "oss-cn-hangzhou",
      objectName: "images/image.png",
      file: new Uint8Array([1, 2]),
    });

    expect(url).toBe("https://example.test/image.png");
    expect(putObjectMock).toHaveBeenCalledWith("images/image.png", Buffer.from([1, 2]), {
      timeout: 5 * 60 * 1000,
    });
  });
});
