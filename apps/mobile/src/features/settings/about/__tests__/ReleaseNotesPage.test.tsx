import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke, Channel: class {} }));
vi.mock("../../../../router", () => ({ useNavigator: () => ({ goBack: vi.fn() }) }));
vi.mock("../../../../components/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("../../../plugins/components/PluginMarkdown", () => ({
  PluginMarkdown: ({ source }: { source: string }) => <p>{source}</p>,
}));

import { ReleaseNotesPage } from "../ReleaseNotesPage";
import { useAppUpdate, type AppUpdateCheck } from "../appUpdate";

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 15; Pixel 9)";
const initialState = useAppUpdate.getState();

function makeCheck(currentVersion: string): AppUpdateCheck {
  return {
    currentVersion,
    available: currentVersion !== "0.2.6",
    latest: {
      version: "0.2.6",
      releaseDate: "2026-10-24T08:00:00.000Z",
      file: "Tau-v0.2.6-android-arm64.apk",
      size: 1,
      sha256: "a".repeat(64),
      releaseNotes: [
        { version: "0.2.6", note: "- 修复闪退" },
        { version: "0.2.5", note: "- 检查更新" },
        { version: "0.2.4", note: "- 旧版本" },
      ],
    },
  };
}

describe("ReleaseNotesPage", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    invoke.mockReset();
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ANDROID_UA);
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

  async function render() {
    await act(async () => {
      root.render(<ReleaseNotesPage />);
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("有新版本时按新到旧列出跨越的版本，并标出发布日期", async () => {
    useAppUpdate.setState({ phase: "available", check: makeCheck("0.2.4"), checkedAt: Date.now() });
    await render();
    const text = host.textContent ?? "";
    expect(text).toContain("更新内容");
    expect(text.indexOf("v0.2.6")).toBeLessThan(text.indexOf("v0.2.5"));
    expect(text).toContain("- 修复闪退");
    expect(text).not.toContain("- 旧版本");
    expect(text).toContain("2026 年 10 月 24 日");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("已是最新时只列本版并标为当前版本", async () => {
    useAppUpdate.setState({ phase: "latest", check: makeCheck("0.2.6"), checkedAt: Date.now() });
    await render();
    expect(host.textContent).toContain("当前版本");
    expect(host.textContent).not.toContain("v0.2.5");
  });

  it("直接打开且还没有检查结果时先检查", async () => {
    invoke.mockResolvedValue(makeCheck("0.2.5"));
    await render();
    expect(invoke).toHaveBeenCalledWith("app_update_check");
    expect(host.textContent).toContain("- 修复闪退");
  });
});
