// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import type { ManagedPlugin } from "../../../contracts";
import { ApiProvider, createQueryClient } from "../app/api";
import { createMockApi } from "../api/mock/mockApi";
import { PluginModerationPage } from "./PluginModerationPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const plugin = (overrides: Partial<ManagedPlugin> = {}): ManagedPlugin => ({
  pluginId: "test.plugin",
  name: "测试插件",
  publisher: { login: "author", avatarUrl: "" },
  repository: "https://github.com/author/plugin",
  releaseCount: 2,
  latestVersion: "1.1.0",
  latestPublishedAt: "2026-10-18T00:00:00.000Z",
  downloadsTotal: 42,
  disabled: null,
  ...overrides,
});

function setup(reviewer = true, path = "/moderation/plugins") {
  const api = createMockApi({ reviewer });
  const list = vi.spyOn(api, "listManagedPlugins").mockResolvedValue({
    items: [
      plugin(),
      plugin({
        pluginId: "banned.plugin",
        name: "违规插件",
        disabled: { reason: "README 含广告", at: "2026-10-17T00:00:00.000Z", by: "admin" },
      }),
    ],
    nextCursor: null,
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <UiProvider>
        <ApiProvider api={api}>
          <QueryClientProvider client={createQueryClient()}>
            <PluginModerationPage />
          </QueryClientProvider>
        </ApiProvider>
      </UiProvider>
    </MemoryRouter>
  );
  return { api, list };
}

it("普通作者看不到插件管理，也不发起查询", async () => {
  const { list } = setup(false);
  await screen.findByText("只有管理员可以管理插件。");
  expect(list).not.toHaveBeenCalled();
});

it("列表区分上架与禁用，禁用需填原因确认后调用处置接口", async () => {
  const { api } = setup();
  const moderate = vi.spyOn(api, "moderatePlugin").mockResolvedValue({
    id: "event",
    reviewer: "admin",
    pluginId: "test.plugin",
    action: "disable_plugin",
    reason: "包含恶意代码或隐私风险",
    createdAt: "2026-10-18",
  });
  await screen.findByText("测试插件");
  expect(screen.getByText("上架中")).toBeTruthy();
  expect(screen.getAllByText("已禁用").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "测试插件的操作" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "禁用插件" }));
  const confirm = screen.getByRole("button", { name: "确认处理" }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "包含恶意代码或隐私风险" }));
  fireEvent.click(screen.getByRole("button", { name: "确认处理" }));
  await waitFor(() => expect(moderate).toHaveBeenCalledTimes(1));
  expect(moderate.mock.calls[0][0]).toMatchObject({
    pluginId: "test.plugin",
    action: "disable_plugin",
    reason: "包含恶意代码或隐私风险",
  });
  expect(typeof moderate.mock.calls[0][0].clientRequestId).toBe("string");
});

it("已禁用插件提供恢复入口；地址栏 q 预填搜索并进入请求", async () => {
  const { api, list } = setup(true, "/moderation/plugins?q=banned");
  await screen.findByText("违规插件");
  expect((screen.getByRole("textbox", { name: "搜索插件" }) as HTMLInputElement).value).toBe(
    "banned"
  );
  await waitFor(() => expect(list.mock.calls.some(call => call[0].q === "banned")).toBe(true));
  const moderate = vi.spyOn(api, "moderatePlugin").mockResolvedValue({
    id: "event",
    reviewer: "admin",
    pluginId: "banned.plugin",
    action: "enable_plugin",
    reason: "作者已整改并通过审核",
    createdAt: "2026-10-18",
  });
  fireEvent.click(screen.getByRole("button", { name: "违规插件的操作" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "恢复上架" }));
  fireEvent.click(screen.getByRole("button", { name: "作者已整改并通过审核" }));
  fireEvent.click(screen.getByRole("button", { name: "确认处理" }));
  await waitFor(() => expect(moderate).toHaveBeenCalledTimes(1));
  expect(moderate.mock.calls[0][0].action).toBe("enable_plugin");
});
