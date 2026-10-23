import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResourceSyncStatusSection, getResourceSyncSummary } from "../SyncStatusSections";

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
    render: async node => {
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
  const button = Array.from(document.querySelectorAll("button")).find(item =>
    item.textContent?.includes(text)
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

  it("可计算资源同步摘要", () => {
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
      })
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
      })
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
      })
    ).toBe("异常");
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
        updateSetting={vi.fn()}
        compressionEnabled={false}
      />
    );

    await clickButtonByText("刷新状态");
    expect(toastSpies.success).toHaveBeenCalledWith("资源同步状态已刷新");

    await clickButtonByText("开始 / 继续同步");
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
        onResourceSyncStart={vi.fn().mockRejectedValue(new Error("RESOURCE_SYNC_FAILED:bad"))}
        onResourceSyncRetryFailed={vi.fn().mockResolvedValue({
          ok: true,
          message: "失败文件重试已启动",
        })}
        onResourceSyncCancel={vi.fn().mockResolvedValue({
          ok: true,
          message: "已发送停止信号",
        })}
        updateSetting={vi.fn()}
        compressionEnabled={false}
      />
    );

    await clickButtonByText("开始 / 继续同步");
    expect(toastSpies.error).toHaveBeenCalledWith(expect.stringContaining("资源同步失败"));
    await controller.cleanup();
  });
});
