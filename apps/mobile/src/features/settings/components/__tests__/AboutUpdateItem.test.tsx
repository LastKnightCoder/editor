import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke, Channel: class {} }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.2.5" }));
vi.mock("../../../../app/AppContext", () => ({ useAppContext: () => ({}) }));

import { AboutUpdateItem } from "../OverviewSection";
import { useAppUpdate } from "../../about/appUpdate";

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 15; Pixel 9)";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)";
const initialState = useAppUpdate.getState();

function checkResult(latestVersion: string) {
  return {
    currentVersion: "0.2.5",
    available: latestVersion !== "0.2.5",
    latest: {
      version: latestVersion,
      releaseDate: "",
      file: `Tau-v${latestVersion}-android-arm64.apk`,
      size: 1,
      sha256: "a".repeat(64),
      releaseNotes: [],
    },
  };
}

describe("AboutUpdateItem", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    invoke.mockReset();
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
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <AboutUpdateItem onOpen={() => undefined} />
        </QueryClientProvider>
      );
    });
    // 版本号查询与更新检查都是异步的，等它们落地
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  it("进入「我的」即检查，有新版本时显示提示", async () => {
    invoke.mockResolvedValue(checkResult("0.2.6"));
    await render(ANDROID_UA);
    expect(invoke).toHaveBeenCalledWith("app_update_check");
    expect(host.querySelector('[aria-label="有新版本 0.2.6"]')).not.toBeNull();
    expect(host.textContent).toContain("关于与更新");
  });

  it("已是最新时只显示当前版本", async () => {
    invoke.mockResolvedValue(checkResult("0.2.5"));
    await render(ANDROID_UA);
    expect(host.textContent).not.toContain("新版本");
    expect(host.textContent).toContain("0.2.5");
  });

  it("iOS 不检查更新", async () => {
    await render(IPHONE_UA);
    expect(invoke).not.toHaveBeenCalled();
  });
});
