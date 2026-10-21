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
  read: vi.fn(),
  getData: vi.fn(),
  exportMarkdown: vi.fn(),
  present: vi.fn(),
  pdf: vi.fn(),
  share: vi.fn(),
  grant: vi.fn(async () => 1),
  describe: vi.fn(),
  chat: vi.fn(),
  openMaterial: vi.fn(),
}));
vi.mock("@/commands/plugin-data", () => ({
  pluginRefExists: mocks.exists,
  readPluginContent: mocks.read,
  getPluginData: mocks.getData,
  grantPluginRefs: mocks.grant,
  describePluginRefs: mocks.describe,
}));
vi.mock("@/commands/chat-session", () => ({ getChatSession: mocks.chat }));
vi.mock("@/services/open-material", () => ({ openMaterial: mocks.openMaterial }));
vi.mock("@/services/content-transfer", () => ({ exportContentAsMarkdown: mocks.exportMarkdown }));
vi.mock("@/components/PresentationMode", () => ({
  default: (props: { content: unknown; onExit: () => void }) => {
    mocks.present(props.content);
    return <button onClick={props.onExit}>退出演示</button>;
  },
}));
vi.mock("@/components/PdfExportModal", () => ({
  PdfExportModal: (props: { title: string; onClose: () => void }) => {
    mocks.pdf(props.title);
    return <button onClick={props.onClose}>关闭导出</button>;
  },
}));
vi.mock("@/components/ContentExportModal", () => ({ default: () => null }));
vi.mock("@/components/EpubExportModal", () => ({ default: () => null }));
vi.mock("@/components/ContentCollaborationControl", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return {
    default: forwardRef(function Share(
      props: { contentId: number; source: unknown; onClose: () => void },
      ref
    ) {
      useImperativeHandle(ref, () => ({ open: () => mocks.share(props.contentId, props.source) }));
      return <button onClick={props.onClose}>关闭协作</button>;
    }),
  };
});
vi.mock("@/commands/entity", () => ({ locateEntity: mocks.locate }));
vi.mock("@/commands", () => ({ searchEntities: mocks.search }));
vi.mock("@/services/open-content", () => ({ openEntity: mocks.openEntity }));
vi.mock("@/services/page-navigation", () => ({ openPage: mocks.openPage }));

import { createDesktopApp, usePluginPickerUi } from "../app";
import { PluginEntityPickerHost } from "@/features/plugins/permissions/PluginEntityPickerHost";
import { PluginContentActionHost } from "@/features/plugins/permissions/PluginContentActionHost";
import { usePluginActionUi } from "../app";

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
    mocks.grant.mockResolvedValue(1);
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

  it("项目、Notebook、材料、主对话与插件内容按各自入口打开，其他场景的对话不能单独打开", async () => {
    const app = createDesktopApp("data.db");
    mocks.chat.mockResolvedValueOnce({ scope: "main-chat" }).mockResolvedValueOnce({
      scope: "pdf-chat",
    });
    await app.open(context(), { kind: "project", id: "2" });
    await app.open(context(), { kind: "notebook", id: "6" });
    await app.open(context(), { kind: "material", id: "pdf-annotation:9" });
    await app.open(context(), { kind: "chat-session", id: "s1" });
    await app.open(context(), { kind: "plugin-entity", id: "4" });
    await expect(app.open(context(), { kind: "chat-session", id: "s2" })).rejects.toThrow(
      "不能单独打开"
    );
    expect(mocks.openPage.mock.calls).toEqual([
      ["project-detail", { id: 2 }],
      ["vibe-learning-detail", { id: 6 }],
      ["chat", { id: "s1" }],
    ]);
    expect(mocks.openMaterial).toHaveBeenCalledWith({ kind: "pdf-annotation", id: 9 });
    expect(mocks.openEntity).toHaveBeenCalledWith({ kind: "plugin-entity", id: 4 });
  });

  it("describe 按插件与已获准的类型交给主进程", async () => {
    mocks.describe.mockResolvedValue([{ status: "ok", title: "课题" }]);
    const result = await createDesktopApp("data.db").describe(
      context(),
      [{ kind: "project", id: "2" }],
      ["project"]
    );
    expect(result).toEqual([{ status: "ok", title: "课题" }]);
    expect(mocks.describe).toHaveBeenCalledWith(
      "data.db",
      plugin.id,
      [{ kind: "project", id: "2" }],
      ["project"]
    );
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
      // 用户选中的内容登记为该插件可读取标题的引用
      expect(mocks.grant).toHaveBeenCalledWith("data.db", plugin.id, [
        { kind: "todo", id: "todo:4:9" },
      ]);

      const cancelled = app.pick(context(), plugin, {
        kinds: ["card"],
        multiple: false,
        title: "选卡片",
      });
      await act(async () => usePluginPickerUi.getState().request?.settle([]));
      expect(await cancelled).toEqual([]);
      expect(mocks.grant).toHaveBeenCalledTimes(1);
      expect(usePluginPickerUi.getState().request).toBeNull();
    } finally {
      act(() => view.unmount());
      host.remove();
    }
  });

  describe("宿主动作", () => {
    const nodes = [{ type: "paragraph", children: [{ text: "正文" }] }];
    beforeEach(() => {
      mocks.read.mockResolvedValue({
        contentId: 8,
        createdAt: 100,
        nodes,
        owners: ["card"],
        pluginOwners: [],
      });
      mocks.locate.mockResolvedValue({ kind: "card", id: 3 });
      mocks.getData.mockResolvedValue({ title: "读书笔记" });
      usePluginActionUi.setState({ request: null });
    });

    it("Markdown 直接导出，取实体标题与正文", async () => {
      await createDesktopApp("data.db").run(context(), plugin, {
        action: "content.export",
        ref: "8:100",
        format: "markdown",
      });
      expect(mocks.read.mock.calls[0].slice(1)).toEqual([8, 100, "nodes"]);
      expect(mocks.getData.mock.calls[0].slice(1)).toEqual(["card", 3]);
      expect(mocks.exportMarkdown).toHaveBeenCalledWith({ title: "读书笔记", content: nodes });
      expect(usePluginActionUi.getState().request).toBeNull();
    });

    it("导出、演示与协作打开宿主界面，关闭或插件停用即撤下", async () => {
      const host = document.createElement("div");
      document.body.append(host);
      const view = createRoot(host);
      await act(async () => view.render(<PluginContentActionHost />));
      const app = createDesktopApp("data.db");
      const settle = () => act(async () => new Promise(resolve => setTimeout(resolve, 50)));
      const click = (label: string) =>
        act(async () =>
          [...host.querySelectorAll("button")].find(item => item.textContent === label)?.click()
        );
      try {
        await act(async () =>
          app.run(context(), plugin, { action: "content.export", ref: "8:100", format: "pdf" })
        );
        await settle();
        expect(mocks.pdf).toHaveBeenCalledWith("读书笔记");
        await click("关闭导出");
        expect(usePluginActionUi.getState().request).toBeNull();

        await act(async () =>
          app.run(context(), plugin, { action: "content.present", ref: "8:100" })
        );
        await settle();
        expect(mocks.present).toHaveBeenCalledWith(nodes);
        await click("退出演示");
        expect(usePluginActionUi.getState().request).toBeNull();

        const controller = new AbortController();
        const live = { pluginId: plugin.id, signal: controller.signal } as PluginContext;
        await act(async () => app.run(live, plugin, { action: "content.share", ref: "8:100" }));
        await settle();
        expect(mocks.share).toHaveBeenCalledWith(8, {
          sourceType: "card",
          sourceId: 3,
          sourceTitle: "读书笔记",
        });
        await act(async () => controller.abort());
        expect(usePluginActionUi.getState().request).toBeNull();
        expect(host.textContent).toBe("");
      } finally {
        act(() => view.unmount());
        host.remove();
      }
    });

    it("内容不存在或不是用户操作时拒绝", async () => {
      const app = createDesktopApp("data.db");
      mocks.read.mockResolvedValueOnce(null);
      await expect(
        app.run(context(), plugin, { action: "content.present", ref: "8:100" })
      ).rejects.toThrow("内容不存在");
      setActivation(false);
      await expect(
        app.run(context(), plugin, { action: "content.present", ref: "8:100" })
      ).rejects.toThrow("用户点击");
      expect(usePluginActionUi.getState().request).toBeNull();
    });
  });
});
