import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Node, Transforms, type Descendant, type Editor as SlateEditor } from "slate";
import { createEditorKit, type EditorKit } from "@tau/editor";
import { defineExtension } from "@tau/editor/api";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { expect, it, vi } from "vitest";
import { mobileI18n, mobileLocaleSource } from "../../../services/i18n";
import { getQueryClient } from "../../../router";
import type { TodoItem } from "../../../types";
import { TodoDetailPage } from "../TodoDetailPage";
import { TodoPage } from "../TodoPage";
import { todoTranslator } from "../i18n";
import { useTodoStore } from "../store/useTodoStore";

const harness = vi.hoisted(() => ({
  kit: undefined as EditorKit | undefined,
  editor: null as SlateEditor | null,
  item: null as TodoItem | null,
  body: [] as Descendant[],
  list: vi.fn(),
  update: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  create: vi.fn(),
  today: vi.fn(async () => null),
  records: vi.fn(async () => []),
  reminders: vi.fn(async () => []),
  groups: vi.fn(),
  systems: vi.fn(),
  groupStats: vi.fn(),
  systemStats: vi.fn(),
  systemItems: vi.fn(),
  createItem: vi.fn(),
}));
vi.mock("../../../services/editorKit", () => ({
  useMobileContentKit: () => harness.kit,
  getMobileContentKit: () => harness.kit,
  getMobileCompactKit: () => harness.kit,
}));
vi.mock("../../../services/tauri", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../services/tauri")>()),
  todoListItems: harness.list,
  todoUpdateItem: harness.update,
  getContentDetail: harness.load,
  updateContent: harness.save,
  createContent: harness.create,
  todoGetRecurrenceCompletion: harness.today,
  todoGetRecurrenceCompletions: harness.records,
  reminderList: harness.reminders,
  todoListGroups: harness.groups,
  todoGetSystemGroups: harness.systems,
  todoGetGroupStats: harness.groupStats,
  todoGetSystemGroupStats: harness.systemStats,
  todoListItemsByType: harness.systemItems,
  todoCreateItem: harness.createItem,
}));

it("详情切换语言保留标题和真实描述编辑器，周期请求不重发且不自动提交标题", async () => {
  const originalLocale = mobileLocaleSource.getSnapshot();
  const client = getQueryClient();
  const originalOptions = client.getDefaultOptions();
  client.clear();
  client.setDefaultOptions({ queries: { retry: false } });
  const onError = vi.fn();
  const onBack = vi.fn();
  const item: TodoItem = {
    id: 17,
    groupId: 7,
    parentId: null,
    title: "用户任务",
    type: "recurring",
    descriptionContentId: null,
    descriptionContent: [],
    isCompleted: false,
    sortIndex: 0,
    isArchived: false,
    createTime: 1,
    updateTime: 1,
    recurrence: {
      id: 23,
      todoItemId: 17,
      type: "daily",
      interval: 1,
      startDate: 1,
      excludeHolidays: false,
      createTime: 1,
      updateTime: 1,
    },
  };
  harness.item = item;
  harness.body = [];
  harness.list.mockImplementation(async () => [harness.item]);
  harness.create.mockImplementation(async (payload: { content: Descendant[] }) => {
    harness.body = structuredClone(payload.content);
    return 101;
  });
  harness.update.mockImplementation(async (payload: Partial<TodoItem>) => {
    if (!harness.item) throw new Error("缺少任务夹具");
    harness.item = { ...harness.item, ...payload, descriptionContent: harness.body };
    return harness.item;
  });
  harness.load.mockImplementation(async (contentId: number) => ({
    contentId,
    content: harness.body,
    contracts: {},
    createTime: 1,
    updateTime: 1,
    count: harness.body.reduce((count, node) => count + Node.string(node).length, 0),
    card: null,
  }));
  harness.save.mockImplementation(
    async (payload: { contentId: number; content: Descendant[] }) => ({
      contentId: payload.contentId,
      content: payload.content,
      createTime: 1,
      updateTime: 1,
      count: 0,
      card: null,
    })
  );
  harness.kit = createEditorKit({
    extensions: [
      defineExtension({
        id: "test.observe-todo-editor",
        plugins: [
          editor => {
            harness.editor = editor;
            return editor;
          },
        ],
      }),
    ],
  });
  useTodoStore.setState({ activeGroupId: 7, filters: { type: "all" }, initializing: false });
  client.setQueryData(["todo", "items", "group", 7], [item]);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const view = () => (
    <I18nRuntimeProvider runtime={mobileI18n}>
      <QueryClientProvider client={client}>
        <DndProvider backend={HTML5Backend}>
          <TodoDetailPage
            todoId={17}
            groupId={7}
            onBack={onBack}
            onError={(error, fallback) => onError(error, fallback)}
          />
        </DndProvider>
      </QueryClientProvider>
    </I18nRuntimeProvider>
  );
  try {
    await act(async () => root.render(view()));
    await act(async () => {
      await vi.waitFor(() => expect(host.querySelector("[data-slate-editor]")).not.toBeNull());
    });
    const editor = harness.editor;
    if (!editor) throw new Error("描述编辑器未挂载");
    await act(async () => {
      Transforms.select(editor, { path: [0, 0], offset: 0 });
      editor.insertText("描述草稿");
    });
    await act(async () => {
      await vi.waitFor(() => {
        expect(harness.item?.descriptionContentId).toBe(101);
        expect(harness.load).toHaveBeenCalled();
      });
    });
    const field = host.querySelector<HTMLTextAreaElement>("textarea");
    const editable = host.querySelector("[data-slate-editor]");
    if (!field || !editable) throw new Error("详情输入未挂载");
    vi.useFakeTimers();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        field,
        "尚未提交的任务标题"
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.focus();
    });
    field.setSelectionRange(1, 4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    const body = Node.string(editor);
    const calls = {
      today: harness.today.mock.calls.length,
      records: harness.records.mock.calls.length,
      list: harness.list.mock.calls.length,
      load: harness.load.mock.calls.length,
      update: harness.update.mock.calls.length,
      save: harness.save.mock.calls.length,
    };
    const keys = client
      .getQueryCache()
      .getAll()
      .map(query => query.queryKey);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => {
        mobileLocaleSource.setLocale(locale);
        root.render(view());
      });
      expect(host.querySelector("textarea")).toBe(field);
      expect(field.value).toBe("尚未提交的任务标题");
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd]).toEqual([1, 4]);
      expect(harness.editor).toBe(editor);
      expect(host.querySelector("[data-slate-editor]")).toBe(editable);
      expect(Node.string(editor)).toBe(body);
      expect(body).toContain("描述草稿");
      expect({
        today: harness.today.mock.calls.length,
        records: harness.records.mock.calls.length,
        list: harness.list.mock.calls.length,
        load: harness.load.mock.calls.length,
        update: harness.update.mock.calls.length,
        save: harness.save.mock.calls.length,
      }).toEqual(calls);
      expect(
        client
          .getQueryCache()
          .getAll()
          .map(query => query.queryKey)
      ).toEqual(keys);
      expect(onError).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
    }
    await act(async () => field.blur());
    expect(harness.update).toHaveBeenLastCalledWith({ id: 17, title: "尚未提交的任务标题" });
  } finally {
    await act(async () => root.unmount());
    host.remove();
    client.clear();
    client.setDefaultOptions(originalOptions);
    mobileLocaleSource.setLocale(originalLocale);
    vi.useRealTimers();
    vi.clearAllMocks();
    harness.kit = undefined;
    harness.editor = null;
  }
});

it("列表按 systemType 展示且保留新建草稿，语言不重置分组或重复初始化", async () => {
  const original = mobileLocaleSource.getSnapshot();
  const client = getQueryClient();
  client.clear();
  const system = {
    id: 11,
    title: "后台原始组名",
    sortIndex: 0,
    isSystem: true,
    systemType: "all" as const,
    isArchived: false,
    createTime: 1,
    updateTime: 1,
  };
  const custom = {
    id: 7,
    title: "用户分组原文",
    sortIndex: 0,
    isSystem: false,
    systemType: null,
    isArchived: false,
    createTime: 1,
    updateTime: 1,
  };
  const item: TodoItem = {
    id: 17,
    groupId: 7,
    parentId: null,
    title: "用户原始任务",
    type: "normal",
    isCompleted: false,
    sortIndex: 0,
    isArchived: false,
    createTime: 1,
    updateTime: 1,
  };
  harness.groups.mockResolvedValue([custom]);
  harness.systems.mockResolvedValue([system]);
  harness.groupStats.mockResolvedValue([{ groupId: 7, total: 1, uncompleted: 1, overdue: 0 }]);
  harness.systemStats.mockResolvedValue([{ groupId: 11, total: 1, uncompleted: 1, overdue: 0 }]);
  harness.systemItems.mockResolvedValue([item]);
  harness.list.mockResolvedValue([item]);
  harness.createItem.mockImplementation(async (payload: Partial<TodoItem>) => ({
    ...item,
    ...payload,
    id: 31,
  }));
  useTodoStore.setState({ activeGroupId: 11, filters: { type: "all" }, initializing: false });
  const onError = vi.fn(),
    openDetail = vi.fn(),
    onBack = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const byText = (text: string) =>
    [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === text);
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={mobileI18n}>
          <QueryClientProvider client={client}>
            <TodoPage
              databaseName="list.db"
              autoOpenCreate
              onBack={onBack}
              onError={onError}
              onOpenDetail={openDetail}
            />
          </QueryClientProvider>
        </I18nRuntimeProvider>
      )
    );
    await act(async () => {
      await vi.waitFor(() => expect(harness.systemItems).toHaveBeenCalled());
    });
    vi.useFakeTimers();
    const create = byText(todoTranslator.t("action.create"));
    if (!create) throw new Error("新建任务菜单未挂载");
    await act(async () => create.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    const field = document.querySelector<HTMLInputElement>(
      `input[placeholder="${todoTranslator.t("task.placeholder")}"]`
    );
    if (!field) throw new Error("新建任务输入未挂载");
    const type = [...document.querySelectorAll("button")].find(
      button =>
        button.textContent?.includes(todoTranslator.t("type")) &&
        button.textContent.includes(todoTranslator.t("type.short.normal"))
    );
    if (!type) throw new Error("类型入口未挂载");
    await act(async () => type.click());
    const deadline = byText(todoTranslator.t("type.short.deadline"));
    if (!deadline) throw new Error("截止类型未挂载");
    await act(async () => deadline.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        field,
        "创建草稿"
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.focus();
    });
    field.setSelectionRange(1, 3);
    const selected = useTodoStore.getState().activeGroupId;
    const keys = client
      .getQueryCache()
      .getAll()
      .map(query => query.queryKey);
    const calls = {
      groups: harness.groups.mock.calls.length,
      systems: harness.systems.mock.calls.length,
      items: harness.systemItems.mock.calls.length,
    };
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => mobileLocaleSource.setLocale(locale));
      expect(
        document.querySelector(`input[placeholder="${todoTranslator.t("task.placeholder")}"]`)
      ).toBe(field);
      expect(field.value).toBe("创建草稿");
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd]).toEqual([1, 3]);
      expect(host.textContent).toContain(todoTranslator.t("group.system.all"));
      expect(useTodoStore.getState().activeGroupId).toBe(selected);
      expect(
        client
          .getQueryCache()
          .getAll()
          .map(query => query.queryKey)
      ).toEqual(keys);
      expect({
        groups: harness.groups.mock.calls.length,
        systems: harness.systems.mock.calls.length,
        items: harness.systemItems.mock.calls.length,
      }).toEqual(calls);
      expect(client.getQueryData(["todo", "systemGroups"])).toEqual([system]);
      expect(client.getQueryData(["todo", "groups"])).toEqual([custom]);
      expect(harness.createItem).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    }
    const confirm = byText(todoTranslator.t("create"));
    if (!confirm) throw new Error("创建确认未挂载");
    await act(async () => confirm.click());
    expect(harness.createItem).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ title: "创建草稿", groupId: 7, type: "deadline" })
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    client.clear();
    mobileLocaleSource.setLocale(original);
    vi.useRealTimers();
    vi.clearAllMocks();
  }
});
