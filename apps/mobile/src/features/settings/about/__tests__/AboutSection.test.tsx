import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke, Channel: class {} }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.2.4" }));
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
});
