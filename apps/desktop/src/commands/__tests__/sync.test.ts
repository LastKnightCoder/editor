import { beforeEach, describe, expect, it, vi } from "vitest";

const mockContext = vi.hoisted(() => {
  let settingState = {
    setting: {
      database: {
        active: "data.db",
        databases: [{ name: "data.db", version: 1 }],
      },
    },
  };

  const syncProvider = {
    uploadFile: vi.fn(async () => true),
    downloadFile: vi.fn(async (objectName: string) => {
      if (objectName === "database_data.db.json") {
        return new TextEncoder().encode(JSON.stringify({ version: 1 }));
      }
      return new Uint8Array([1, 2, 3]);
    }),
    fileExists: vi.fn(async () => true),
  };

  const useSettingStoreMock = {
    getState: vi.fn(() => settingState),
    setState: vi.fn((updater: any) => {
      settingState =
        typeof updater === "function" ? updater(settingState) : updater;
    }),
  };

  const useGlobalStateStoreMock = {
    setState: vi.fn(),
  };

  return {
    get settingState() {
      return settingState;
    },
    setSettingState(nextState: typeof settingState) {
      settingState = nextState;
    },
    syncProvider,
    useSettingStoreMock,
    useGlobalStateStoreMock,
    reconnectDatabaseFast: vi.fn(async () => undefined),
    connectDatabaseByName: vi.fn(async () => undefined),
    readBinaryFile: vi.fn(async () => new Uint8Array([9, 9, 9])),
    writeBinaryFile: vi.fn(async () => undefined),
    createDir: vi.fn(async () => undefined),
    pathExists: vi.fn(async () => true),
    getSep: vi.fn(async () => "/"),
    closeDatabase: vi.fn(async () => undefined),
    removeFile: vi.fn(async () => undefined),
    invoke: vi.fn(async (channel: string) => {
      if (channel === "get-database-path") {
        return "/tmp/data.db";
      }
      return "";
    }),
    message: {
      error: vi.fn(),
      warning: vi.fn(),
    },
  };
});

vi.mock("antd", () => ({
  message: mockContext.message,
}));

vi.mock("@/electron", () => ({
  invoke: mockContext.invoke,
}));

vi.mock("@/commands", () => ({
  connectDatabaseByName: mockContext.connectDatabaseByName,
  reconnectDatabaseFast: mockContext.reconnectDatabaseFast,
  readBinaryFile: mockContext.readBinaryFile,
  writeBinaryFile: mockContext.writeBinaryFile,
  createDir: mockContext.createDir,
  pathExists: mockContext.pathExists,
  getSep: mockContext.getSep,
  closeDatabase: mockContext.closeDatabase,
  removeFile: mockContext.removeFile,
}));

vi.mock("@/stores/useSettingStore.ts", () => ({
  default: mockContext.useSettingStoreMock,
}));

vi.mock("@/stores/useGlobalStateStore", () => ({
  default: mockContext.useGlobalStateStoreMock,
}));

vi.mock("@/utils/sync", () => ({
  SyncProviderFactory: {
    getSyncProvider: () => mockContext.syncProvider,
  },
}));

import { download, upload } from "../sync";

describe("sync commands reconnect source", () => {
  beforeEach(() => {
    mockContext.setSettingState({
      setting: {
        database: {
          active: "data.db",
          databases: [{ name: "data.db", version: 1 }],
        },
      },
    });
    mockContext.syncProvider.uploadFile.mockClear();
    mockContext.syncProvider.downloadFile.mockClear();
    mockContext.syncProvider.fileExists.mockClear();
    mockContext.useSettingStoreMock.getState.mockClear();
    mockContext.useSettingStoreMock.setState.mockClear();
    mockContext.useGlobalStateStoreMock.setState.mockClear();
    mockContext.reconnectDatabaseFast.mockClear();
    mockContext.connectDatabaseByName.mockClear();
    mockContext.readBinaryFile.mockClear();
    mockContext.writeBinaryFile.mockClear();
    mockContext.createDir.mockClear();
    mockContext.pathExists.mockClear();
    mockContext.getSep.mockClear();
    mockContext.closeDatabase.mockClear();
    mockContext.removeFile.mockClear();
    mockContext.invoke.mockClear();
    mockContext.message.error.mockClear();
    mockContext.message.warning.mockClear();
  });

  it("上传完成后使用 sync_upload_reconnect 重连", async () => {
    const success = await upload();

    expect(success).toBe(true);
    expect(mockContext.reconnectDatabaseFast).toHaveBeenCalledWith(
      "data.db",
      "sync_upload_reconnect",
    );
  });

  it("下载完成后使用维护模式重连以执行 schema 迁移", async () => {
    mockContext.syncProvider.downloadFile.mockImplementation(
      async (objectName: string) => {
        if (objectName === "database_data.db.json") {
          return new TextEncoder().encode(JSON.stringify({ version: 2 }));
        }
        return new Uint8Array([1, 2, 3]);
      },
    );

    const success = await download();

    expect(success).toBe(true);
    expect(mockContext.reconnectDatabaseFast).not.toHaveBeenCalled();
    expect(mockContext.connectDatabaseByName).toHaveBeenCalledWith("data.db", {
      force: true,
      mode: "maintenance",
      source: "sync_download_reconnect",
    });
  });

  it("自动下载后立即 reload 时跳过成功后的即时重连", async () => {
    mockContext.syncProvider.downloadFile.mockImplementation(
      async (objectName: string) => {
        if (objectName === "database_data.db.json") {
          return new TextEncoder().encode(JSON.stringify({ version: 2 }));
        }
        return new Uint8Array([1, 2, 3]);
      },
    );

    const success = await download({ skipReconnectAfterSuccess: true });

    expect(success).toBe(true);
    expect(mockContext.reconnectDatabaseFast).not.toHaveBeenCalled();
    expect(mockContext.useGlobalStateStoreMock.setState).toHaveBeenCalled();
  });
});
