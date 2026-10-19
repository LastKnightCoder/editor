// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import type { ReleaseSummary } from "../../../contracts";
import { ApiProvider, createQueryClient } from "../app/api";
import { createMockApi } from "../api/mock/mockApi";
import { content } from "../api/mock/samples";
import { PluginDetailPage } from "./PluginDetailPage";
import { savePluginZip } from "../api/download";
vi.mock("../api/download", () => ({ savePluginZip: vi.fn(async () => undefined) }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const release = (id: string, version: string, publishedAt: string): ReleaseSummary => ({
  id,
  pluginId: "example.reader",
  version,
  state: "published",
  sha256: "f".repeat(64),
  size: 2048,
  error: null,
  publishedAt,
  downloadUrl: "",
  manifest: { ...content.manifest, version },
});

function setup(path = "/plugins/example.reader") {
  const api = createMockApi();
  // 补发的旧版本发布时间更晚，最新版本仍按 SemVer 取 1.2.0
  vi.spyOn(api, "listReleases").mockResolvedValue({
    items: [release("r1", "1.0.1", "2026-10-17"), release("r2", "1.2.0", "2026-10-16")],
    nextCursor: null,
  });
  const getRelease = vi.spyOn(api, "getRelease").mockImplementation(async id => ({
    ...release(id, "1.2.0", "2026-10-16"),
    content: { ...content, manifest: { ...content.manifest, version: "1.2.0" } },
    repository: "https://github.com/author/reader",
    commit: "a".repeat(40),
    publisher: { login: "author", avatarUrl: "" },
  }));
  vi.spyOn(api, "getPluginStats").mockResolvedValue({
    downloadsTotal: 4321,
    downloads7d: 21,
    windowStart: "2026-10-12",
  });
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

it("详情读取最高版本的资料与统计，版本页可下载任一版本", async () => {
  const { api, getRelease } = setup();
  await screen.findByRole("button", { name: "下载 v1.2.0" });
  expect(getRelease).toHaveBeenCalledWith("r2");
  expect(await screen.findByText("4,321")).toBeTruthy();
  expect(screen.getByText("启用插件后打开侧边栏入口。")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: /版本/ }));
  fireEvent.click(await screen.findByRole("button", { name: "下载 v1.0.1" }));
  await waitFor(() =>
    expect(savePluginZip).toHaveBeenCalledWith(api, "r1", "example.reader-1.0.1.zip")
  );
});

it("没有已发布版本时提示找不到", async () => {
  const api = createMockApi();
  render(
    <MemoryRouter initialEntries={["/plugins/missing"]}>
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
  await screen.findByText("找不到这个插件");
});
