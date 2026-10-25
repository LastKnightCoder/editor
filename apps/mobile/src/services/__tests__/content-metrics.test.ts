import { afterEach, expect, it, vi } from "vitest";
import { definePlugin, defineEditorExtension } from "@tau/plugins";
import { mobileContentPlugins } from "../../app/plugins/content";
import {
  articleCreate,
  collabProjectContent,
  createContent,
  createQuickCard,
  diaryUpsertEntry,
  todoCreateItem,
  todoCreateItemRelative,
  projectItemCreate,
  calendarEventCreate,
  updateContent,
} from "../tauri";

const invoke = vi.hoisted(() =>
  vi.fn(async (_command?: string, _args?: unknown): Promise<unknown> => ({
    id: 1,
    type: "daily",
    date: "2026-10-24",
    segments: [],
    activeDatabase: "a.db",
  }))
);
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("../../utils/perf", () => ({ logPerf: vi.fn() }));
afterEach(() => {
  mobileContentPlugins.install([]);
  vi.restoreAllMocks();
  invoke.mockReset();
  invoke.mockResolvedValue({
    id: 1,
    type: "daily",
    date: "2026-10-24",
    segments: [],
    activeDatabase: "a.db",
  });
});

it("卡片、正文、文章、协作和日记提交使用当前插件规则，忽略调用方旧计数", async () => {
  mobileContentPlugins.install([
    definePlugin({
      id: "example.source",
      name: "源码",
      version: "1.0.0",
      editorExtensions: [
        defineEditorExtension({
          id: "example.source",
          elements: [{ type: "example.source", dataVersion: 1, kind: "block", render: () => null }],
        }),
      ],
      editorMetrics: [{ type: "example.source", textFields: ["source"] }],
    }),
  ]);
  const content = [
    { type: "example.source", source: "你好世界", children: [{ type: "formatted", text: "" }] },
  ];
  await createContent({ content, count: 999 });
  await createQuickCard({ content, count: 999 });
  await updateContent({ contentId: 1, content, count: 999 });
  await articleCreate({ title: "文章", content, count: 999 });
  await collabProjectContent({ documentId: "room", contentId: 1, content, count: 999 });
  for (const [, args] of vi.mocked(invoke).mock.calls as unknown as [
    string,
    { payload: { count: number } },
  ][]) {
    expect(args.payload.count).toBe(4);
  }
  await diaryUpsertEntry({ type: "daily", date: "2026-10-24", content: content as never });
  expect(invoke).toHaveBeenLastCalledWith("diary_upsert_entry", {
    payload: expect.objectContaining({ wordCount: 4 }),
  });
  await projectItemCreate({ projectId: 1, title: "正文", content });
  await calendarEventCreate({
    calendarId: 1,
    title: "备注",
    startDate: 1,
    allDay: true,
    detailContent: content,
  });
  for (const [command, args] of invoke.mock.calls as unknown as [
    string,
    {
      payload: {
        content?: Record<string, unknown>[];
        detailContent?: Record<string, unknown>[];
        contracts?: Record<string, unknown>;
      };
    },
  ][]) {
    if (
      ![
        "create_content",
        "create_quick_card",
        "article_create",
        "diary_upsert_entry",
        "project_item_create",
        "calendar_event_create",
      ].includes(command)
    )
      continue;
    const node = (args.payload.content ?? args.payload.detailContent)![0];
    expect(args.payload.contracts?.[String(node.tauContract)]).toMatchObject({
      type: "example.source",
      dataVersion: 1,
    });
    expect(node.source).toBe("你好世界");
  }
});

it("两种待办创建入口从编辑器准备备注契约，保留单次创建请求与单词计数", async () => {
  await todoCreateItem({ groupId: 1, title: "待办", description: "hello world" });
  await todoCreateItemRelative({
    refId: 1,
    position: "child",
    title: "待办",
    description: "hello world",
  });
  for (const [command, args] of vi.mocked(invoke).mock.calls as unknown as [
    string,
    {
      databaseName: string;
      payload: {
        descriptionCount: number;
        descriptionContent: Record<string, unknown>[];
        contracts: Record<string, unknown>;
      };
    },
  ][]) {
    if (command === "list_databases") continue;
    expect(args.databaseName).toBe("a.db");
    expect(args.payload.descriptionCount).toBe(2);
    const node = args.payload.descriptionContent[0];
    expect(node.children).toEqual([{ type: "formatted", text: "hello world" }]);
    expect(args.payload.contracts[String(node.tauContract)]).toMatchObject({
      type: "paragraph",
      dataVersion: 1,
    });
    expect(args.payload).not.toHaveProperty("description");
  }
  expect(invoke.mock.calls.filter(([command]) => command?.startsWith("todo_create_"))).toHaveLength(
    2
  );
});

it.each([false, true])(
  "待办准备正文期间切库仍提交发起库，并保留原生拒绝结果（相对创建=%s）",
  async relative => {
    const { getMobileContentKit } = await import("../editorKit");
    const catalog = await mobileContentPlugins.prepareEditorContracts(
      getMobileContentKit().extensions
    );
    let resume!: () => void;
    const waiting = new Promise<void>(resolve => {
      resume = resolve;
    });
    let entered!: () => void;
    const preparing = new Promise<void>(resolve => {
      entered = resolve;
    });
    vi.spyOn(mobileContentPlugins, "prepareEditorContracts").mockImplementationOnce(async () => {
      entered();
      await waiting;
      return catalog;
    });
    let active = "a.db";
    invoke.mockImplementation(async (command, args) => {
      if (command === "list_databases") return { activeDatabase: active };
      if ((args as { databaseName: string }).databaseName !== active)
        throw new Error("CONTENT_SOURCE_CONFLICT");
      throw new Error("不应写入新资料库");
    });
    const request = relative
      ? todoCreateItemRelative({ refId: 1, position: "child", title: "待办", description: "正文" })
      : todoCreateItem({ groupId: 1, title: "待办", description: "正文" });
    const rejected = expect(request).rejects.toThrow("CONTENT_SOURCE_CONFLICT");
    await preparing;
    active = "b.db";
    resume();
    await rejected;
    expect(invoke).toHaveBeenLastCalledWith(
      relative ? "todo_create_item_relative" : "todo_create_item",
      expect.objectContaining({ databaseName: "a.db" })
    );
  }
);

it("空待办备注不创建正文", async () => {
  await todoCreateItem({ groupId: 1, title: "待办", description: "  " });
  expect(invoke).toHaveBeenCalledWith(
    "todo_create_item",
    expect.objectContaining({
      payload: expect.objectContaining({ descriptionContent: undefined, contracts: undefined }),
    })
  );
});

it("日程新建与修改的备注也在提交边界重算", async () => {
  const { calendarEventCreate, calendarEventUpdate } = await import("../tauri");
  const payload = {
    calendarId: 1,
    title: "日程",
    startDate: 1,
    allDay: true,
    detailContent: [{ type: "paragraph", children: [{ text: "hello world" }] }],
    detailContentCount: 999,
  };
  await calendarEventCreate(payload);
  await calendarEventUpdate({ ...payload, id: 1 });
  for (const [, args] of vi.mocked(invoke).mock.calls as unknown as [
    string,
    { payload: { detailContentCount: number } },
  ][]) {
    expect(args.payload.detailContentCount).toBe(2);
  }
});
