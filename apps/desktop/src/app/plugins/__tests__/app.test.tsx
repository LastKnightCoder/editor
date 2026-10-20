import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@tau/plugins";

const mocks = vi.hoisted(() => ({
  exists: vi.fn(async () => true),
  locate: vi.fn(),
  openEntity: vi.fn(),
  openPage: vi.fn(),
  search: vi.fn(),
}));
vi.mock("@/commands/plugin-data", () => ({ pluginRefExists: mocks.exists }));
vi.mock("@/commands/entity", () => ({ locateEntity: mocks.locate }));
vi.mock("@/commands", () => ({ searchEntities: mocks.search }));
vi.mock("@/services/open-content", () => ({ openEntity: mocks.openEntity }));
vi.mock("@/services/page-navigation", () => ({ openPage: mocks.openPage }));

import { createDesktopApp, usePluginPickerUi } from "../app";
import { PluginEntityPickerHost } from "@/features/plugins/permissions/PluginEntityPickerHost";

const plugin = { id: "canvas", name: "画布" };
const context = () =>
  ({ pluginId: plugin.id, signal: new AbortController().signal }) as PluginContext;
const setActivation = (isActive: boolean | undefined) =>
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    value: isActive === undefined ? undefined : { isActive },
  });

describe("插件选择与打开", () => {
  beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
    mocks.exists.mockResolvedValue(true);
    setActivation(true);
    usePluginPickerUi.setState({ request: null });
  });
  afterEach(() => setActivation(undefined));

  it("按类型打开对应页面", async () => {
    const app = createDesktopApp("data.db");
    await app.open(context(), { kind: "card", id: "3" });
    await app.open(context(), { kind: "whiteboard", id: "5" });
    await app.open(context(), { kind: "todo", id: "todo:4:9@2026-10-21" });
    await app.open(context(), { kind: "event", id: "7:100" });
    expect(mocks.openEntity).toHaveBeenCalledWith({ kind: "card", id: 3 });
    expect(mocks.openPage.mock.calls).toEqual([
      ["whiteboard-detail", { id: 5 }],
      ["todos", { selectedId: 4 }],
      ["schedule", { eventId: 7 }],
    ]);
  });

  it("正文里的待办打开所在文档并定位到勾选项", async () => {
    mocks.locate.mockResolvedValue({ kind: "project_item", id: 12 });
    await createDesktopApp("data.db").open(context(), { kind: "todo", id: "document:8:1:t-1" });
    expect(mocks.locate).toHaveBeenCalledWith({ contentId: 8 });
    expect(mocks.openEntity).toHaveBeenCalledWith(
      { kind: "project-item", id: 12 },
      { at: { taskId: "t-1" } }
    );
  });

  it("内容不存在或不是用户操作时拒绝", async () => {
    const app = createDesktopApp("data.db");
    mocks.exists.mockResolvedValueOnce(false);
    await expect(app.open(context(), { kind: "card", id: "3" })).rejects.toThrow("内容不存在");
    setActivation(false);
    await expect(app.open(context(), { kind: "card", id: "3" })).rejects.toThrow("用户点击");
    expect(() =>
      app.pick(context(), plugin, { kinds: ["card"], multiple: false, title: "选" })
    ).toThrow("用户点击");
    expect(mocks.openEntity).not.toHaveBeenCalled();
  });

  it("选择弹窗返回与 context.data 一致的引用，关闭返回空选择", async () => {
    mocks.search.mockResolvedValue([
      {
        kind: "todo",
        id: 4,
        createdAt: 9,
        contentId: null,
        title: "交周报",
        excerpt: "",
        meta: "",
        time: 1,
      },
    ]);
    const host = document.createElement("div");
    document.body.append(host);
    const view = createRoot(host);
    await act(async () =>
      view.render(
        <QueryClientProvider client={new QueryClient()}>
          <PluginEntityPickerHost />
        </QueryClientProvider>
      )
    );
    try {
      const app = createDesktopApp("data.db");
      const picking = app.pick(context(), plugin, {
        kinds: ["todo", "event"],
        multiple: false,
        title: "关联待办",
      });
      await act(async () => new Promise(resolve => setTimeout(resolve, 300)));
      expect(document.body.textContent).toContain("关联待办");
      const row = [...document.querySelectorAll<HTMLElement>("[data-index]")].find(item =>
        item.textContent?.includes("交周报")
      );
      await act(async () => row?.click());
      expect(await picking).toEqual([{ ref: { kind: "todo", id: "todo:4:9" }, title: "交周报" }]);

      const cancelled = app.pick(context(), plugin, {
        kinds: ["card"],
        multiple: false,
        title: "选卡片",
      });
      await act(async () => usePluginPickerUi.getState().request?.settle([]));
      expect(await cancelled).toEqual([]);
      expect(usePluginPickerUi.getState().request).toBeNull();
    } finally {
      act(() => view.unmount());
      host.remove();
    }
  });
});
