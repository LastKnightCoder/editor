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

it("公开目录不要求登录，显示统计、分页去重并传递排序和下载版本", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  const api = createMockApi();
  await api.logout();
  const session = vi.spyOn(api, "getSession");
  const row = (id: string): CatalogEntry => ({
    pluginId: id,
    name: `插件 ${id}`,
    description: "介绍",
    repository: "",
    publisher: { login: "author", avatarUrl: "" },
    downloadsTotal: 12,
    downloads7d: 3,
    compatible: null,
    latest: {
      releaseId: id,
      version: "1.0.0",
      minAppVersion: "0.59.0",
      publishedAt: "2026-10-18",
      size: 1,
      sha256: "",
      downloadUrl: "",
    },
  });
  const catalog = vi.spyOn(api, "getCatalog").mockImplementation(async input => ({
    items: input.cursor ? [row("a"), row("b")] : [row("a")],
    nextCursor: input.cursor ? null : "next",
    windowStart: "2026-10-12",
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
  await screen.findByText("插件 a");
  expect(session).not.toHaveBeenCalled();
  expect(screen.getByText("累计 12 次 · 近 7 日 3 次")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
  await screen.findByText("插件 b");
  expect(screen.getAllByText("插件 a")).toHaveLength(1);
  fireEvent.click(screen.getByRole("combobox", { name: "插件排序" }));
  fireEvent.click(await screen.findByRole("option", { name: "下载最多" }));
  await waitFor(() =>
    expect(catalog).toHaveBeenLastCalledWith({ q: "", sort: "downloadsTotal", cursor: null })
  );
  fireEvent.click((await screen.findAllByRole("button", { name: "下载 ZIP" }))[0]);
  await waitFor(() => expect(savePluginZip).toHaveBeenCalledWith(api, "a", "a-1.0.0.zip"));
});
