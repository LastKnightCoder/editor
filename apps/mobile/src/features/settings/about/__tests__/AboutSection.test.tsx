import { mobileLocaleSource } from "../../../../services/i18n";
import { captureAppUpdateFailure } from "../errors";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke, Channel: class {} }));
const getVersion = vi.hoisted(() => vi.fn(async () => "0.2.4"));
vi.mock("@tauri-apps/api/app", () => ({ getVersion }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(async () => undefined) }));
const push = vi.hoisted(() => vi.fn());
vi.mock("../../../../router", () => ({ useNavigator: () => ({ push }) }));

import { AboutSection } from "../AboutSection";
import { useAppUpdate } from "../appUpdate";

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 15; Pixel 9)";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)";
const initialState = useAppUpdate.getState();

describe("AboutSection", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    invoke.mockReset();
    getVersion.mockClear();
    push.mockReset();
    useAppUpdate.setState(initialState, true);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  async function render(userAgent: string) {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
    const client = new QueryClient();
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <AboutSection />
        </QueryClientProvider>
      );
    });
    // 版本号查询与更新检查都是异步的，等它们落地
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  it("Android 打开即检查，发现新版本时给出下载入口，更新内容点进独立页面", async () => {
    invoke.mockResolvedValue({
      currentVersion: "0.2.4",
      available: true,
      latest: {
        version: "0.2.5",
        releaseDate: "2026-10-24T00:00:00.000Z",
        file: "Tau-v0.2.5-android-arm64.apk",
        size: 60 * 1024 * 1024,
        sha256: "a".repeat(64),
        releaseNotes: [{ version: "0.2.5", note: "- 修复同步" }],
      },
    });
    await render(ANDROID_UA);
    expect(invoke).toHaveBeenCalledWith("app_update_check");
    expect(host.textContent).toContain("发现新版本 0.2.5");
    expect(host.textContent).toContain("下载并安装");
    expect(host.textContent).not.toContain("- 修复同步");
    expect(host.textContent).toContain("版本 0.2.4");
    const notesRow = Array.from(host.querySelectorAll<HTMLElement>("[role=button]")).find(row =>
      row.textContent?.includes("新版本更新内容")
    );
    act(() => notesRow?.click());
    expect(push).toHaveBeenCalledWith("releaseNotes");
  });

  it("iOS 不展示更新区也不检查", async () => {
    await render(IPHONE_UA);
    expect(invoke).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("软件更新");
    expect(host.textContent).toContain("使用文档");
  });

  it("切换语言保留下载进度、版本载荷与错误原诊断，不重查、下载或安装", async () => {
    const original = mobileLocaleSource.getSnapshot();
    const check = {
      currentVersion: "0.2.4",
      available: true,
      latest: {
        version: "0.2.5",
        releaseDate: "2026-10-24T00:00:00.000Z",
        file: "Tau-v0.2.5-android-arm64.apk",
        size: 60 * 1024 * 1024,
        sha256: "a".repeat(64),
        releaseNotes: [{ version: "0.2.5", note: "原始更新正文" }],
      },
    };
    const progress = { received: 12 * 1024 * 1024, total: 60 * 1024 * 1024 };
    useAppUpdate.setState({ phase: "downloading", check, progress, checkedAt: Date.now() });
    try {
      await render(ANDROID_UA);
      const snapshot = useAppUpdate.getState(),
        reads = getVersion.mock.calls.length;
      for (const locale of ["zh-TW", "en-US"]) {
        await act(async () => mobileLocaleSource.setLocale(locale));
        expect(useAppUpdate.getState()).toBe(snapshot);
        expect(snapshot.check).toBe(check);
        expect(snapshot.progress).toBe(progress);
        expect(getVersion).toHaveBeenCalledTimes(reads);
        expect(invoke).not.toHaveBeenCalled();
      }
      const failure = captureAppUpdateFailure("APP_UPDATE_CORRUPT: fixture digest mismatch");
      await act(async () =>
        useAppUpdate.setState({ phase: "available", progress: null, error: failure })
      );
      const failed = useAppUpdate.getState();
      for (const locale of ["zh-CN", "en-US"]) {
        await act(async () => mobileLocaleSource.setLocale(locale));
        expect(useAppUpdate.getState()).toBe(failed);
        expect(failed.error).toBe(failure);
        expect(failure.diagnostic).toBe("fixture digest mismatch");
        expect(getVersion).toHaveBeenCalledTimes(reads);
        expect(invoke).not.toHaveBeenCalled();
      }
    } finally {
      await act(async () => mobileLocaleSource.setLocale(original));
    }
  });
});
