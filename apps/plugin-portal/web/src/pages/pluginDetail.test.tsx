// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import type { CenterRelease } from "../../../contracts";
import { centerRelease } from "../../../../../tests/fixtures/plugins/center";
import { ApiProvider, createQueryClient } from "../app/api";
import { createMockApi } from "../api/mock/mockApi";
import { saveBlob } from "../components/saveBlob";
import { PluginDetailPage } from "./PluginDetailPage";
vi.mock("../components/saveBlob", () => ({ saveBlob: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const release = (releaseId: string, version: string, publishedAt: string): CenterRelease => {
  const base = centerRelease(version, releaseId);
  return {
    ...base,
    publishedAt,
    content: { ...base.content, readme: "启用插件后打开页面入口。" },
  };
};

function render_(path = "/plugins/example.counter", centerReleases: CenterRelease[] = []) {
  const api = createMockApi({ centerReleases });
  vi.spyOn(api, "getPluginStats").mockResolvedValue({
    downloadsTotal: 4321,
    downloads7d: 21,
    windowStart: "2026-10-12",
  });
  const getRelease = vi.spyOn(api.center, "getRelease");
  render(
    <MemoryRouter initialEntries={[path]}>
      <UiProvider>
        <ApiProvider api={api}>
          <QueryClientProvider client={createQueryClient()}>
            <Routes>
              <Route path="/plugins/:pluginId" element={<PluginDetailPage />} />
            </Routes>
          </QueryClientProvider>
        </ApiProvider>
      </UiProvider>
    </MemoryRouter>
  );
  return { api, getRelease };
}

it("详情按 SemVer 取最高版本，展示平台支持与网页未核验说明，版本页经 v2 下载任一版本", async () => {
  // 补发的旧版本发布时间更晚，最新版本仍按 SemVer 取 1.2.0
  const { api, getRelease } = render_("/plugins/example.counter?platform=android", [
    release("r1", "1.0.1", "2026-10-17T00:00:00Z"),
    release("r2", "1.2.0", "2026-10-16T00:00:00Z"),
  ]);
  await screen.findByRole("button", { name: "下载 v1.2.0" });
  expect(getRelease).toHaveBeenCalledWith("r2", expect.anything());
  expect(await screen.findByText("4,321")).toBeTruthy();
  expect(screen.getByText("启用插件后打开页面入口。")).toBeTruthy();
  expect(screen.getByText("跨端 · web-v1")).toBeTruthy();
  expect(screen.getByRole("note").textContent).toMatch(/网页无法确认你的设备能否安装/);
  expect(screen.queryByText(/可安装 v/)).toBeNull();

  fireEvent.click(screen.getByRole("tab", { name: "平台支持" }));
  const android = await screen.findByRole("region", { name: "Android目标" });
  expect(within(android).getByText("0.2.0")).toBeTruthy();
  expect(android.className).toContain("border-accent");
  expect(within(screen.getByRole("region", { name: "iOS目标" })).getByText("未声明")).toBeTruthy();

  const blob = new Blob(["zip"]);
  const download = vi.spyOn(api.center, "download").mockResolvedValue(blob);
  fireEvent.click(screen.getByRole("tab", { name: /版本/ }));
  fireEvent.click(await screen.findByRole("button", { name: "下载 v1.0.1" }));
  await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, "example.counter-1.0.1.zip"));
  expect(download).toHaveBeenCalledWith("r1");
});

it("旧格式版本标为仅桌面，并保留本地安装说明", async () => {
  const base = release("r1", "1.0.0", "2026-10-16T00:00:00Z");
  const desktop = { minAppVersion: "0.59.0", required: [], optional: [] };
  render_("/plugins/example.counter", [
    { ...base, formatVersion: 1, profile: null, targets: { desktop } },
  ]);
  expect(await screen.findByText("旧格式（仅桌面）")).toBeTruthy();
  expect(screen.getAllByRole("list", { name: "支持平台：桌面（旧格式）" }).length).toBeGreaterThan(
    0
  );
  expect(screen.getByText(/在桌面端插件页选择本地安装/)).toBeTruthy();
});

it("没有已发布版本时提示找不到", async () => {
  render_("/plugins/missing");
  await screen.findByText("找不到这个插件");
});
