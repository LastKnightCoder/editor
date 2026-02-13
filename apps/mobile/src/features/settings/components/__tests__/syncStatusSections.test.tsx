import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DatabaseSyncStatusSection,
  ResourceSyncStatusSection,
  getDatabaseSyncSummary,
  getResourceSyncSummary,
} from "../SyncStatusSections";

const toastSpies = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("../../../../components/toast", () => ({
  toast: {
    success: toastSpies.success,
    error: toastSpies.error,
    info: toastSpies.info,
  },
}));

type RenderController = {
  render: (node: ReactNode) => Promise<void>;
  cleanup: () => Promise<void>;
};

function createRenderController(): RenderController {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);

  return {
    render: async (node) => {
      await act(async () => {
        root.render(node);
      });
      await act(async () => {
        await Promise.resolve();
      });
    },
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function clickButtonByText(text: string): Promise<void> {
  const button = Array.from(document.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );
  expect(button).toBeTruthy();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("SyncStatusSections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("可计算数据库与资源同步摘要", () => {
    expect(getDatabaseSyncSummary(null)).toBe("未开始");
    expect(
      getDatabaseSyncSummary({
        databaseName: "data.db",
        localVersion: 5,
        remoteVersion: 5,
      }),
    ).toBe("已同步");
    expect(
      getDatabaseSyncSummary({
        databaseName: "data.db",
        localVersion: 9,
        remoteVersion: 7,
      }),
    ).toBe("本地领先");
    expect(
      getDatabaseSyncSummary({
        databaseName: "data.db",
        localVersion: 7,
        remoteVersion: 9,
      }),
    ).toBe("远端领先");

    expect(
      getResourceSyncSummary({
        totalFiles: 20,
        processedFiles: 10,
        currentFile: null,
        status: "syncing",
        uploadCount: 0,
        downloadCount: 0,
        skippedCount: 0,
        errorCount: 0,
        startTime: null,
      }),
    ).toBe("同步中 50%");
    expect(
      getResourceSyncSummary({
        totalFiles: 10,
        processedFiles: 10,
        currentFile: null,
        status: "completed",
        uploadCount: 0,
        downloadCount: 0,
        skippedCount: 0,
        errorCount: 0,
        startTime: null,
      }),
    ).toBe("已完成");
    expect(
      getResourceSyncSummary({
        totalFiles: 10,
        processedFiles: 3,
        currentFile: null,
        status: "error",
        uploadCount: 0,
        downloadCount: 0,
        skippedCount: 0,
        errorCount: 1,
        startTime: null,
      }),
    ).toBe("异常");
  });

  it("数据库同步详情使用 toast 反馈刷新与上传，且不渲染内联提示", async () => {
    const controller = createRenderController();
    await controller.render(
      <DatabaseSyncStatusSection
        versions={{
          databaseName: "data.db",
          localVersion: 4,
          remoteVersion: 3,
        }}
        isSyncing={false}
        onCheckVersions={vi.fn().mockResolvedValue({
          databaseName: "data.db",
          localVersion: 4,
          remoteVersion: 4,
        })}
        onSyncUpload={vi.fn().mockResolvedValue({
          ok: true,
          message: "上传完成",
        })}
        onSyncDownload={vi.fn().mockResolvedValue({
          ok: true,
          message: "下载完成",
        })}
      />,
    );

    await clickButtonByText("刷新");
    expect(toastSpies.success).toHaveBeenCalledWith(
      expect.stringContaining("刷新完成"),
    );
    expect(document.body.textContent?.includes("刷新完成：")).toBe(false);

    await clickButtonByText("上传");
    expect(toastSpies.success).toHaveBeenCalledWith("上传完成");
    await controller.cleanup();
  });

  it("数据库同步详情刷新失败时触发错误 toast", async () => {
    const controller = createRenderController();
    await controller.render(
      <DatabaseSyncStatusSection
        versions={null}
        isSyncing={false}
        onCheckVersions={vi
          .fn()
          .mockRejectedValue(new Error("SYNC_CHECK_FAILED:detail"))}
        onSyncUpload={vi.fn().mockResolvedValue({
          ok: true,
          message: "上传完成",
        })}
        onSyncDownload={vi.fn().mockResolvedValue({
          ok: true,
          message: "下载完成",
        })}
      />,
    );

    await clickButtonByText("刷新");
    expect(toastSpies.error).toHaveBeenCalledWith(
      expect.stringContaining("同步状态刷新失败"),
    );
    await controller.cleanup();
  });

  it("资源同步详情动作通过 toast 反馈", async () => {
    const controller = createRenderController();
    await controller.render(
      <ResourceSyncStatusSection
        resourceSyncProgress={{
          totalFiles: 5,
          processedFiles: 1,
          currentFile: "a.png",
          status: "syncing",
          uploadCount: 2,
          downloadCount: 1,
          skippedCount: 0,
          errorCount: 0,
          startTime: null,
        }}
        resourceSyncStatusFile={{
          provider: "github",
          config: {},
          lastSyncTime: null,
          files: {},
        }}
        isResourceSyncing={false}
        onResourceSyncRefresh={vi.fn().mockResolvedValue(undefined)}
        onResourceSyncStart={vi.fn().mockResolvedValue({
          ok: true,
          message: "资源同步已启动",
        })}
        onResourceSyncRetryFailed={vi.fn().mockResolvedValue({
          ok: true,
          message: "失败文件重试已启动",
        })}
        onResourceSyncCancel={vi.fn().mockResolvedValue({
          ok: true,
          message: "已发送停止信号",
        })}
      />,
    );

    await clickButtonByText("刷新资源");
    expect(toastSpies.success).toHaveBeenCalledWith("资源同步状态已刷新");

    await clickButtonByText("开始同步");
    expect(toastSpies.success).toHaveBeenCalledWith("资源同步已启动");
    await controller.cleanup();
  });

  it("资源同步动作失败时触发错误 toast", async () => {
    const controller = createRenderController();
    await controller.render(
      <ResourceSyncStatusSection
        resourceSyncProgress={{
          totalFiles: 0,
          processedFiles: 0,
          currentFile: null,
          status: "idle",
          uploadCount: 0,
          downloadCount: 0,
          skippedCount: 0,
          errorCount: 0,
          startTime: null,
        }}
        resourceSyncStatusFile={null}
        isResourceSyncing={false}
        onResourceSyncRefresh={vi.fn().mockResolvedValue(undefined)}
        onResourceSyncStart={vi
          .fn()
          .mockRejectedValue(new Error("RESOURCE_SYNC_FAILED:bad"))}
        onResourceSyncRetryFailed={vi.fn().mockResolvedValue({
          ok: true,
          message: "失败文件重试已启动",
        })}
        onResourceSyncCancel={vi.fn().mockResolvedValue({
          ok: true,
          message: "已发送停止信号",
        })}
      />,
    );

    await clickButtonByText("开始同步");
    expect(toastSpies.error).toHaveBeenCalledWith(
      expect.stringContaining("资源同步失败"),
    );
    await controller.cleanup();
  });
});
