import { beforeEach, describe, expect, it, vi } from "vitest";

const { getObjectMock, ossConstructorMock } = vi.hoisted(() => ({
  getObjectMock: vi.fn(),
  ossConstructorMock: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("ali-oss", () => ({
  default: ossConstructorMock.mockImplementation(() => ({
    get: getObjectMock,
  })),
}));

import AliOssModule from "../ali-oss";

describe("ali-oss", () => {
  beforeEach(() => {
    getObjectMock.mockReset();
    ossConstructorMock.mockClear();
  });

  it("同步下载应使用 5 分钟超时", async () => {
    getObjectMock.mockResolvedValue({ content: Buffer.from("database") });

    await AliOssModule.getObject({
      accessKeyId: "access-key-id",
      accessKeySecret: "access-key-secret",
      bucket: "backup-bucket",
      region: "oss-cn-hangzhou",
      objectName: "sync/database.sqlite",
    });

    expect(getObjectMock).toHaveBeenCalledWith("sync/database.sqlite", {
      timeout: 5 * 60 * 1000,
    });
  });
});
