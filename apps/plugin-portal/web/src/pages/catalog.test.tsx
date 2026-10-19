// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import type { CatalogEntry } from "../../../contracts";
import { ApiProvider, createQueryClient } from "../app/api";
import { createMockApi } from "../api/mock/mockApi";
import { CatalogPage } from "./CatalogPage";
import { savePluginZip } from "../api/download";
vi.mock("../api/download", () => ({ savePluginZip: vi.fn(async () => undefined) }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const row = (id: string): CatalogEntry => ({
  pluginId: id,
  name: `插件 ${id}`,
  description: "介绍",
  repository: "",
  categories: ["editor", "ai"],
  publisher: { login: "author", avatarUrl: "" },
  downloadsTotal: 12,
  downloads7d: 3,
  likes: 5,
  compatible: null,
  latest: {
    releaseId: id,
    version: "1.0.0",
    minAppVersion: "0.59.0",
    publishedAt: "2026-10-18T00:00:00.000Z",
    size: 1,
    sha256: "",
    downloadUrl: "",
  },
});

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
  const catalog = vi.spyOn(api, "getCatalog").mockImplementation(async input => ({
    items: input.cursor ? [row("a"), row("b")] : [row("a")],
    nextCursor: input.cursor ? null : "next",
    windowStart: "2026-10-12",
    categoryCounts: input.cursor ? null : { editor: 2, ai: 1 },
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

it("公开目录不要求登录，卡片链接详情，分页去重并显示下载与喜欢", async () => {
  const { api } = setup();
  const session = vi.spyOn(api, "getSession");
  const link = await screen.findByRole("link", { name: "插件 a" });
  expect(link.getAttribute("href")).toBe("/plugins/a");
  expect(screen.getByTitle("累计下载").textContent).toBe("12");
  expect(screen.getByTitle("喜欢").textContent).toBe("5");
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
  await screen.findByText("插件 b");
  expect(screen.getAllByText("插件 a")).toHaveLength(1);
  expect(session).not.toHaveBeenCalled();
});

it("排序走菜单，搜索防抖后才请求，快速下载使用最新版本", async () => {
  const { api, catalog } = setup();
  await screen.findByText("插件 a");
  fireEvent.click(screen.getByRole("button", { name: "排序：最近热门" }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: "下载最多" }));
  await waitFor(() =>
    expect(catalog).toHaveBeenLastCalledWith({
      q: "",
      category: null,
      sort: "downloadsTotal",
      cursor: null,
    })
  );
  fireEvent.change(screen.getByRole("textbox", { name: "搜索插件" }), {
    target: { value: " 同步 " },
  });
  expect(catalog).not.toHaveBeenLastCalledWith(expect.objectContaining({ q: "同步" }));
  await waitFor(() =>
    expect(catalog).toHaveBeenLastCalledWith({
      q: "同步",
      category: null,
      sort: "downloadsTotal",
      cursor: null,
    })
  );
  fireEvent.click((await screen.findAllByRole("button", { name: "下载 ZIP" }))[0]);
  await waitFor(() => expect(savePluginZip).toHaveBeenCalledWith(api, "a", "a-1.0.0.zip"));
});

it("分类条只列有插件的分类，单选后按分类请求，卡片显示分类", async () => {
  const { catalog } = setup();
  await screen.findByText("插件 a");
  expect(screen.getByText("编辑器 · AI")).toBeTruthy();
  const group = screen.getByRole("group", { name: "插件分类" });
  expect([...group.querySelectorAll("button")].map(button => button.textContent)).toEqual([
    "全部",
    "编辑器2",
    "AI1",
  ]);
  fireEvent.click(screen.getByRole("button", { name: /^编辑器/ }));
  await waitFor(() =>
    expect(catalog).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: "editor", cursor: null })
    )
  );
  expect(screen.getByRole("button", { name: /^编辑器/ }).getAttribute("aria-pressed")).toBe("true");
  // 回到「全部」命中 60 秒缓存，不重复请求
  fireEvent.click(screen.getByRole("button", { name: "全部" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "全部" }).getAttribute("aria-pressed")).toBe("true")
  );
  expect(await screen.findByText("插件 a")).toBeTruthy();
});
