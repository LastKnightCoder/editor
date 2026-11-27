import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UiProvider } from "@tau/ui";
import { promptAppUpgradeFromError, useUpgradePromptStore } from "@/app/upgradePromptStore";
import { useUpdateStore } from "@/stores/useUpdateStore";
import { UpgradePromptHost } from "../UpgradePromptHost";

const mocks = vi.hoisted(() => ({
  getVersions: vi.fn().mockResolvedValue({ app: "0.62.0" }),
  openExternal: vi.fn().mockResolvedValue(undefined),
  check: vi.fn().mockResolvedValue(undefined),
  download: vi.fn().mockResolvedValue(undefined),
  install: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/commands", () => ({
  getVersions: mocks.getVersions,
  openExternal: mocks.openExternal,
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  useUpgradePromptStore.setState({ open: false, request: null });
  useUpdateStore.setState({
    status: "ready",
    currentVersion: "0.62.0",
    newVersion: "0.63.0",
    fallbackUrl: "https://taunote.app/download",
    releaseNotes: [],
    autoChecked: false,
    progress: 100,
    errorMessage: null,
    check: mocks.check,
    download: mocks.download,
    install: mocks.install,
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("UpgradePromptHost", () => {
  it("命中带时区日程写入拒绝错误时打开升级弹窗，支持原地重启安装与还原时间脱困", async () => {
    const revertTime = vi.fn();
    await act(async () =>
      root.render(
        <UiProvider>
          <UpgradePromptHost />
        </UiProvider>
      )
    );

    let handled = false;
    await act(async () => {
      handled = promptAppUpgradeFromError(
        new Error("SQLITE_CONSTRAINT_TRIGGER: 该日程包含时区，请升级 Tau 后再修改时间。"),
        {
          reason: "calendar-timezone-write",
          context: "产品评审",
          secondaryAction: { label: "还原时间", onClick: revertTime },
        }
      );
    });

    expect(handled).toBe(true);
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("产品评审");

    const buttons = Array.from(dialog?.querySelectorAll("button") ?? []);
    const installButton = buttons.find(b => b.textContent?.includes("重启并安装"));
    expect(installButton).toBeDefined();
    await act(async () => installButton?.click());
    expect(mocks.install).toHaveBeenCalledTimes(1);

    const revertButton = buttons.find(b => b.textContent?.includes("还原时间"));
    expect(revertButton).toBeDefined();
    await act(async () => revertButton?.click());
    expect(revertTime).toHaveBeenCalledTimes(1);
    expect(useUpgradePromptStore.getState().open).toBe(false);
  });

  it("更新状态为 idle 时打开弹窗会自动触发一次静默检查，状态为 available 时主按钮触发下载", async () => {
    useUpdateStore.setState({ status: "idle", newVersion: null });
    await act(async () =>
      root.render(
        <UiProvider>
          <UpgradePromptHost />
        </UiProvider>
      )
    );

    await act(async () => {
      useUpgradePromptStore.getState().show({
        reason: "plugin-min-version",
        context: "播客",
        minAppVersion: "0.63.0",
      });
    });
    expect(mocks.check).toHaveBeenCalledWith({ silent: true });

    await act(async () => {
      useUpdateStore.setState({ status: "available", newVersion: "0.63.0" });
    });
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    const downloadButton = Array.from(dialog?.querySelectorAll("button") ?? []).find(b =>
      b.textContent?.includes("下载并更新")
    );
    expect(downloadButton).toBeDefined();
    await act(async () => downloadButton?.click());
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });
});
