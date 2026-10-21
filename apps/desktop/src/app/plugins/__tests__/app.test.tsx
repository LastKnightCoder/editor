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
  resolveContent: vi.fn(),
  createCard: vi.fn(),
  insertDocument: vi.fn(),
  planNotebook: vi.fn(),
  createNotebook: vi.fn(),
}));
vi.mock("@/services/notebook-creation", () => ({
  createNotebookWithResources: mocks.createNotebook,
  notebookPlanImpact: () => "带入 2 份资料",
}));
vi.mock("@/components/InsertNoteToTreeModal", () => ({
  default: (props: {
    noteTitle: string;
    noteContent: unknown;
    onSuccess: (item: { id: number } | null) => void;
    onCancel: () => void;
  }) => {
    mocks.insertDocument(props.noteTitle, props.noteContent);
    return (
      <>
        <button onClick={() => props.onSuccess({ id: 31 })}>插入文档</button>
        <button onClick={props.onCancel}>取消插入</button>
      </>
    );
  },
}));
vi.mock("@/commands/plugin-data", () => ({
  pluginRefExists: mocks.exists,
  readPluginContent: mocks.read,
  getPluginData: mocks.getData,
  grantPluginRefs: mocks.grant,
  describePluginRefs: mocks.describe,
  resolvePluginContentInput: mocks.resolveContent,
  planPluginNotebook: mocks.planNotebook,
}));
vi.mock("@/features/cards/components/CreateCardDialog", () => ({
  CreateCardDialog: (props: {
    initial: unknown;
    onCreated: (card: { id: number }) => void;
    onClose: () => void;
  }) => {
    mocks.createCard(props.initial);
    return (
      <>
        <button
          onClick={() => {
            props.onCreated({ id: 21 });
            props.onClose();
          }}
        >
          保存卡片
        </button>
        <button onClick={props.onClose}>取消新建</button>
      </>
    );
  },
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

    const mount = async () => {
      const host = document.createElement("div");
      document.body.append(host);
      const view = createRoot(host);
      await act(async () => view.render(<PluginContentActionHost />));
      const settle = () => act(async () => new Promise(resolve => setTimeout(resolve, 50)));
      // 弹窗经 Portal 渲染到 body
      const click = (label: string) =>
        act(async () =>
          [...document.querySelectorAll("button")].find(item => item.textContent === label)?.click()
        );
      const unmount = () => {
        act(() => view.unmount());
        host.remove();
      };
      return { host, settle, click, unmount };
    };

    it("导出、演示与协作打开宿主界面，关闭后才返回，插件停用即撤下", async () => {
      const { host, settle, click, unmount } = await mount();
      const app = createDesktopApp("data.db");
      try {
        let finished = false;
        const exported = app
          .run(context(), plugin, { action: "content.export", ref: "8:100", format: "pdf" })
          .then(() => (finished = true));
        await settle();
        expect(mocks.pdf).toHaveBeenCalledWith("读书笔记");
        expect(finished).toBe(false);
        await click("关闭导出");
        await exported;
        expect(usePluginActionUi.getState().request).toBeNull();

        const presented = app.run(context(), plugin, { action: "content.present", ref: "8:100" });
        await settle();
        expect(mocks.present).toHaveBeenCalledWith(nodes);
        // 同一时间只能打开一个
        await expect(
          app.run(context(), plugin, { action: "content.share", ref: "8:100" })
        ).rejects.toThrow("请先完成或关闭");
        await click("退出演示");
        await presented;

        const controller = new AbortController();
        const live = { pluginId: plugin.id, signal: controller.signal } as PluginContext;
        const shared = app.run(live, plugin, { action: "content.share", ref: "8:100" });
        await settle();
        expect(mocks.share).toHaveBeenCalledWith(8, {
          sourceType: "card",
          sourceId: 3,
          sourceTitle: "读书笔记",
        });
        await act(async () => controller.abort());
        await shared;
        expect(usePluginActionUi.getState().request).toBeNull();
        expect(host.textContent).toBe("");
      } finally {
        unmount();
      }
    });

    it("新建 Notebook：核对来源，确认框带资料计划，确认后返回引用，取消返回 null", async () => {
      const { settle, click, unmount } = await mount();
      const app = createDesktopApp("data.db");
      const plan = { notes: [], excerpts: [{ kind: "excerpt", id: 2 }], clips: [], skipped: 1 };
      mocks.planNotebook.mockResolvedValue(plan);
      mocks.createNotebook.mockResolvedValue({ projectId: 6, failed: 0 });
      try {
        const created = app.run(context(), plugin, {
          action: "notebook.create",
          title: "土地财政",
          sources: [{ kind: "material", id: "excerpt:2" }],
          from: { kind: "plugin-entity", id: "9" },
        });
        await settle();
        expect(mocks.exists).toHaveBeenCalledWith("data.db", "plugin-entity", "9");
        expect(mocks.planNotebook).toHaveBeenCalledWith("data.db", [
          { kind: "material", id: "excerpt:2" },
        ]);
        expect(document.body.textContent).toContain("带入 2 份资料");
        await click("新建");
        expect(await created).toEqual({ kind: "notebook", id: "6" });
        expect(mocks.createNotebook).toHaveBeenCalledWith({
          title: "土地财政",
          plan,
          from: { kind: "plugin-entity", id: 9 },
          mainDbName: "data.db",
        });

        const cancelled = app.run(context(), plugin, {
          action: "notebook.create",
          title: "空课题",
          sources: [],
        });
        await settle();
        await click("取消");
        expect(await cancelled).toBeNull();

        mocks.exists.mockResolvedValueOnce(false);
        await expect(
          app.run(context(), plugin, {
            action: "notebook.create",
            title: "x",
            sources: [],
            from: { kind: "card", id: "1" },
          })
        ).rejects.toThrow("来源不存在");
      } finally {
        unmount();
      }
    });

    it("插入到项目：复制解析后的正文，插入后返回项目文档引用，取消返回 null", async () => {
      const { settle, click, unmount } = await mount();
      const app = createDesktopApp("data.db");
      mocks.resolveContent.mockResolvedValue(nodes);
      try {
        const inserted = app.run(context(), plugin, {
          action: "project.insertDocument",
          content: { copyOf: "8:100" },
          title: "读书笔记",
        });
        await settle();
        expect(mocks.resolveContent).toHaveBeenCalledWith("data.db", {
          copyOf: { contentId: 8, createdAt: 100 },
        });
        expect(mocks.insertDocument).toHaveBeenLastCalledWith("读书笔记", nodes);
        await click("插入文档");
        expect(await inserted).toEqual({ kind: "document", id: "31" });

        const cancelled = app.run(context(), plugin, {
          action: "project.insertDocument",
          content: { markdown: "" },
        });
        await settle();
        expect(mocks.insertDocument).toHaveBeenLastCalledWith("未命名文档", expect.any(Array));
        await click("取消插入");
        expect(await cancelled).toBeNull();
        expect(usePluginActionUi.getState().request).toBeNull();
      } finally {
        unmount();
      }
    });

    it("新建卡片：预填解析后的正文与标签，保存返回卡片引用，取消或停用返回 null", async () => {
      const { settle, click, unmount } = await mount();
      const app = createDesktopApp("data.db");
      mocks.resolveContent.mockResolvedValue(nodes);
      try {
        const saved = app.run(context(), plugin, {
          action: "card.create",
          content: { markdown: "正文" },
          tags: ["读书"],
        });
        await settle();
        expect(mocks.resolveContent).toHaveBeenCalledWith("data.db", { markdown: "正文" });
        expect(mocks.createCard).toHaveBeenLastCalledWith({ content: nodes, tags: ["读书"] });
        await click("保存卡片");
        expect(await saved).toEqual({ kind: "card", id: "21" });
        expect(usePluginActionUi.getState().request).toBeNull();

        // 不带正文时不解析，预填空卡片
        const cancelled = app.run(context(), plugin, { action: "card.create" });
        await settle();
        expect(mocks.resolveContent).toHaveBeenCalledTimes(1);
        expect(mocks.createCard).toHaveBeenLastCalledWith({
          content: expect.any(Array),
          tags: [],
        });
        await click("取消新建");
        expect(await cancelled).toBeNull();

        const controller = new AbortController();
        const live = { pluginId: plugin.id, signal: controller.signal } as PluginContext;
        const aborted = app.run(live, plugin, { action: "card.create" });
        await settle();
        await act(async () => controller.abort());
        expect(await aborted).toBeNull();
        expect(usePluginActionUi.getState().request).toBeNull();
      } finally {
        unmount();
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
