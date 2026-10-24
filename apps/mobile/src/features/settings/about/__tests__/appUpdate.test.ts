import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const toastInfo = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
  Channel: class {
    onmessage: (message: unknown) => void = () => undefined;
  },
}));
vi.mock("../../../../components/toast", () => ({ toast: { info: toastInfo } }));

import { notesToShow, supportsInAppUpdate, useAppUpdate, type AppUpdateCheck } from "../appUpdate";

function makeCheck(currentVersion: string, latestVersion: string): AppUpdateCheck {
  return {
    currentVersion,
    available: currentVersion !== latestVersion,
    latest: {
      version: latestVersion,
      releaseDate: "2026-10-24T00:00:00.000Z",
      file: `Tau-v${latestVersion}-android-arm64.apk`,
      size: 1024,
      sha256: "a".repeat(64),
      releaseNotes: ["0.2.6", "0.2.5", "0.2.4", "0.2.3"].map(version => ({
        version,
        note: `- ${version}`,
      })),
    },
  };
}

const initialState = useAppUpdate.getState();

beforeEach(() => {
  invoke.mockReset();
  toastInfo.mockReset();
  useAppUpdate.setState(initialState, true);
});

describe("notesToShow", () => {
  it("有新版本时列出跨越的版本，从新到旧", () => {
    expect(notesToShow(makeCheck("0.2.4", "0.2.6")).map(item => item.version)).toEqual([
      "0.2.6",
      "0.2.5",
    ]);
  });

  it("已是最新时只列本版", () => {
    expect(notesToShow(makeCheck("0.2.4", "0.2.4")).map(item => item.version)).toEqual(["0.2.4"]);
  });
});

describe("useAppUpdate", () => {
  it("只在 Android 上提供应用内更新", () => {
    expect(supportsInAppUpdate("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe(true);
    expect(supportsInAppUpdate("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)")).toBe(
      false
    );
  });

  it("检查到新版本后下载并拉起安装器", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "app_update_check") return makeCheck("0.2.4", "0.2.6");
      if (command === "app_update_download") return "0.2.6";
      if (command === "app_update_install") return "started";
      throw new Error(command);
    });
    await useAppUpdate.getState().checkForUpdate();
    expect(useAppUpdate.getState().phase).toBe("available");

    await useAppUpdate.getState().download();
    expect(useAppUpdate.getState().phase).toBe("ready");
    expect(invoke).toHaveBeenLastCalledWith("app_update_install", { version: "0.2.6" });
  });

  it("未授权安装时提示去系统设置，保留已下载状态", async () => {
    useAppUpdate.setState({ phase: "ready", downloadedVersion: "0.2.6" });
    invoke.mockResolvedValue("permission-required");
    await useAppUpdate.getState().install();
    expect(toastInfo).toHaveBeenCalledOnce();
    expect(useAppUpdate.getState().phase).toBe("ready");
  });

  it("下载失败退回可下载状态并给出原因", async () => {
    useAppUpdate.setState({ phase: "available", check: makeCheck("0.2.4", "0.2.6") });
    invoke.mockRejectedValue("APP_UPDATE_CORRUPT: size or digest mismatch");
    await useAppUpdate.getState().download();
    expect(useAppUpdate.getState()).toMatchObject({
      phase: "available",
      error: "安装包校验未通过，请重新下载",
    });
  });

  it("安装包被系统清理后回到可下载状态", async () => {
    useAppUpdate.setState({ phase: "ready", downloadedVersion: "0.2.6" });
    invoke.mockRejectedValue("APP_UPDATE_NOT_DOWNLOADED: package missing");
    await useAppUpdate.getState().install();
    expect(useAppUpdate.getState()).toMatchObject({ phase: "available", downloadedVersion: null });
  });

  it("检查失败时保留空闲状态以便重试", async () => {
    invoke.mockRejectedValue("APP_UPDATE_NETWORK: timeout");
    await useAppUpdate.getState().checkForUpdate();
    expect(useAppUpdate.getState()).toMatchObject({
      phase: "idle",
      error: "网络连接失败，请稍后重试",
    });
  });
});
