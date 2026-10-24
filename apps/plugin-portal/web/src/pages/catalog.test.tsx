// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import type { CenterCatalogEntry } from "../../../contracts";
import { centerRelease } from "../../../../../tests/fixtures/plugins/center";
import { ApiProvider, createQueryClient } from "../app/api";
import { createMockApi } from "../api/mock/mockApi";
import { saveBlob } from "../components/saveBlob";
import { CatalogPage } from "./CatalogPage";
vi.mock("../components/saveBlob", () => ({ saveBlob: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const row = (id: string): CenterCatalogEntry => {
  const release = centerRelease("1.0.0", id);
  const latest: CenterCatalogEntry["latest"] = {
    releaseId: release.releaseId,
    version: release.version,
    formatVersion: release.formatVersion,
    apiVersion: release.apiVersion,
    profile: release.profile,
    targets: release.targets,
    publishedAt: release.publishedAt,
    size: release.size,
    sha256: release.sha256,
    downloadUrl: release.downloadUrl,
  };
  return {
    pluginId: id,
    name: `插件 ${id}`,
    description: "介绍",
    repository: release.repository,
    categories: ["editor", "ai"],
    keywords: [],
    publisher: { ...release.publisher, login: "author" },
    downloadsTotal: 12,
    downloads7d: 3,
    likes: 5,
    latest,
    compatible: null,
    compatibility: { status: "unchecked", reasons: [] },
  };
};

function setup() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  const api = createMockApi();
  const catalog = vi.spyOn(api.center, "queryCatalog").mockImplementation(async input => ({
    items: input.cursor ? [row("a"), row("b")] : [row("a")],
    nextCursor: input.cursor ? null : "next",
    windowStart: "2026-10-12",
    categoryCounts: input.cursor ? null : { editor: 2, ai: 1 },
    platformCounts: input.cursor ? null : { all: 2, desktop: 1, android: 2, ios: 0 },
  }));
  render(
    <MemoryRouter>
      <UiProvider>
        <ApiProvider api={api}>
          <QueryClientProvider client={createQueryClient()}>
            <CatalogPage />
          </QueryClientProvider>
        </ApiProvider>
      </UiProvider>
    </MemoryRouter>
  );
  return { api, catalog };
}
const lastQuery = (catalog: ReturnType<typeof setup>["catalog"]) => catalog.mock.lastCall?.[0];

it("公开目录不要求登录，卡片链接详情，分页去重并显示下载、喜欢与平台", async () => {
  const { api } = setup();
  const session = vi.spyOn(api, "getSession");
  const link = await screen.findByRole("link", { name: "插件 a" });
  expect(link.getAttribute("href")).toBe("/plugins/a");
  expect(screen.getByTitle("累计下载").textContent).toBe("12");
  expect(screen.getByTitle("喜欢").textContent).toBe("5");
  expect(screen.getByRole("list", { name: "支持平台：Android" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
  await screen.findByText("插件 b");
  expect(screen.getAllByText("插件 a")).toHaveLength(1);
  expect(session).not.toHaveBeenCalled();
});

it("排序走菜单，搜索防抖后才请求，快速下载经 v2 使用最新版本", async () => {
  const { api, catalog } = setup();
  const blob = new Blob(["zip"]);
  const download = vi.spyOn(api.center, "download").mockResolvedValue(blob);
  await screen.findByText("插件 a");
  expect(lastQuery(catalog)).toMatchObject({ platform: "all", cursor: null });
  expect(lastQuery(catalog)).not.toHaveProperty("host");
  fireEvent.click(screen.getByRole("button", { name: "排序：最近热门" }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: "下载最多" }));
  await waitFor(() =>
    expect(lastQuery(catalog)).toMatchObject({ q: "", category: null, sort: "downloadsTotal" })
  );
  fireEvent.change(screen.getByRole("textbox", { name: "搜索插件" }), {
    target: { value: " 同步 " },
  });
  expect(lastQuery(catalog)).not.toMatchObject({ q: "同步" });
  await waitFor(() =>
    expect(lastQuery(catalog)).toMatchObject({ q: "同步", sort: "downloadsTotal" })
  );
  fireEvent.click((await screen.findAllByRole("button", { name: "下载 ZIP" }))[0]);
  await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, "a-1.0.0.zip"));
  expect(download).toHaveBeenCalledWith("a");
});

it("分类条只列有插件的分类，单选后按分类请求，卡片显示分类", async () => {
  const { catalog } = setup();
  await screen.findByText("插件 a");
  expect(
    [...screen.getByRole("list", { name: "分类" }).querySelectorAll("li")].map(
      item => item.textContent
    )
  ).toEqual(["编辑器", "AI"]);
  const group = screen.getByRole("group", { name: "插件分类" });
  expect([...group.querySelectorAll("button")].map(button => button.textContent)).toEqual([
    "全部",
    "编辑器2",
    "AI1",
  ]);
  fireEvent.click(screen.getByRole("button", { name: /^编辑器/ }));
  await waitFor(() =>
    expect(lastQuery(catalog)).toMatchObject({ category: "editor", cursor: null })
  );
  expect(screen.getByRole("button", { name: /^编辑器/ }).getAttribute("aria-pressed")).toBe("true");
  // 回到「全部」命中 60 秒缓存，不重复请求
  fireEvent.click(screen.getByRole("button", { name: "全部" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "全部" }).getAttribute("aria-pressed")).toBe("true")
  );
  expect(await screen.findByText("插件 a")).toBeTruthy();
});

it("平台筛选按平台请求且不带宿主，只说明浏览声明，详情链接带上平台", async () => {
  const { catalog } = setup();
  await screen.findByText("插件 a");
  const group = screen.getByRole("group", { name: "目标平台" });
  await waitFor(() =>
    expect([...group.querySelectorAll("button")].map(button => button.textContent)).toEqual([
      "全部平台2",
      "桌面1",
      "Android2",
      "iOS0",
    ])
  );
  fireEvent.click(screen.getByRole("button", { name: /^Android/ }));
  await waitFor(() =>
    expect(lastQuery(catalog)).toMatchObject({ platform: "android", cursor: null })
  );
  expect(lastQuery(catalog)).not.toHaveProperty("host");
  expect(screen.getByText(/仅显示声明支持Android的插件/)).toBeTruthy();
  expect(screen.queryByText(/可安装 v/)).toBeNull();
  await waitFor(() =>
    expect(screen.getByRole("link", { name: "插件 a" }).getAttribute("href")).toBe(
      "/plugins/a?platform=android"
    )
  );
});
