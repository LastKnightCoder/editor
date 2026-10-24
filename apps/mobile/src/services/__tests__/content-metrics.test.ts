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
  updateContent,
} from "../tauri";

const invoke = vi.hoisted(() =>
  vi.fn(async () => ({ id: 1, type: "daily", date: "2026-10-24", segments: [] }))
);
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("../../utils/perf", () => ({ logPerf: vi.fn() }));
afterEach(() => {
  mobileContentPlugins.install([]);
  invoke.mockClear();
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
          elements: [{ type: "example.source", kind: "block", render: () => null }],
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
  await collabProjectContent({ contentId: 1, content, count: 999 });
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
});

it("两种待办创建入口按单词统计备注，不按字符数统计英文", async () => {
  await todoCreateItem({ groupId: 1, title: "待办", description: "hello world" });
  await todoCreateItemRelative({
    refId: 1,
    position: "child",
    title: "待办",
    description: "hello world",
  });
  for (const [, args] of vi.mocked(invoke).mock.calls as unknown as [
    string,
    { payload: { descriptionCount: number } },
  ][]) {
    expect(args.payload.descriptionCount).toBe(2);
  }
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
