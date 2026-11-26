import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Node, Transforms, type Editor as SlateEditor } from "slate";
import { createEditorKit, type EditorKit } from "@tau/editor";
import { defineExtension } from "@tau/editor/api";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { expect, it, vi } from "vitest";
import { mobileI18n, mobileLocaleSource } from "../../../services/i18n";
import { dateTimePickerMessages } from "../../../components/DateTimePickerSheet.i18n";
import { getQueryClient, getNavigator, RouterProvider, definePage } from "../../../router";
import { PageInstanceProvider } from "../../../router/pageLifecycle";
import { CalendarEventEditPage } from "../CalendarEventEditPage";
import { CalendarHomePage } from "../CalendarHomePage";
import { calendarTranslator } from "../i18n";
import type { Calendar, CalendarEvent } from "../types";

const harness = vi.hoisted(() => ({
  kit: undefined as EditorKit | undefined,
  editor: null as SlateEditor | null,
  calendars: vi.fn(),
  event: vi.fn(),
  events: vi.fn<(params: { calendarIds: number[] }) => Promise<CalendarEvent[]>>(async () => []),
  update: vi.fn(),
  remove: vi.fn(),
  reminders: vi.fn(async () => []),
  setReminders: vi.fn(async () => []),
}));
vi.mock("../../../services/editorKit", () => ({
  useMobileContentKit: () => harness.kit,
  getMobileContentKit: () => harness.kit,
  getMobileCompactKit: () => harness.kit,
}));
vi.mock("../../../services/tauri", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../services/tauri")>()),
  calendarGetAll: harness.calendars,
  calendarEventGetById: harness.event,
  calendarEventGetByDateRange: harness.events,
  calendarEventUpdate: harness.update,
  calendarEventDelete: harness.remove,
  reminderList: harness.reminders,
  reminderSet: harness.setReminders,
}));
definePage({ key: "calendar-locale-test-root", params: {}, component: () => null });

function CalendarPageContext({ children }: { children: ReactNode }) {
  return (
    <PageInstanceProvider
      value={{
        entry: {
          id: "calendar-edit-test",
          key: "calendarEventEdit",
          params: {},
          createdAt: 1,
          lastActiveAt: 1,
        },
        params: {},
        navigator: getNavigator(),
        phase: "active",
        transition: { seq: 0, type: null },
      }}
    >
      {children}
    </PageInstanceProvider>
  );
}
const calendar: Calendar = {
  id: 1,
  title: "用户日历",
  color: "blue",
  descriptionContentId: 0,
  archived: false,
  pinned: false,
  visible: true,
  orderIndex: 0,
  groupId: null,
  createTime: 1,
  updateTime: 1,
  isInSystemGroup: false,
  eventCount: 1,
};
const byText = (text: string) => {
  const result = [...document.querySelectorAll("button")].find(
    button => button.textContent?.trim() === text
  );
  if (!result) throw new Error(`未找到操作：${text}`);
  return result;
};

it("语言切换保留真实日程草稿与挂起日期，且不重载、自动提交或重建退出基线", async () => {
  const originalLocale = mobileLocaleSource.getSnapshot();
  const client = getQueryClient();
  client.clear();
  mobileLocaleSource.setLocale("zh-CN");
  const event: CalendarEvent = {
    id: 7,
    calendarId: 1,
    title: "原始日程",
    detailContentId: 9,
    detailContent: [{ type: "paragraph", children: [{ type: "formatted", text: "原始备注" }] }],
    startDate: new Date(2026, 8, 14).getTime(),
    endDate: null,
    startTime: 540,
    endTime: 600,
    color: "blue",
    allDay: false,
    calendarTitle: calendar.title,
    calendarColor: calendar.color,
    isInSystemEvent: false,
  };
  harness.calendars.mockResolvedValue([calendar]);
  harness.event.mockResolvedValue(event);
  harness.update.mockImplementation(async payload => ({ ...event, ...payload }));
  harness.kit = createEditorKit({
    extensions: [
      defineExtension({
        id: "test.observe-calendar-editor",
        plugins: [
          editor => {
            harness.editor = editor;
            return editor;
          },
        ],
      }),
    ],
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onBack = vi.fn(),
    onSaved = vi.fn(),
    onError = vi.fn();
  const view = () => (
    <I18nRuntimeProvider runtime={mobileI18n}>
      <QueryClientProvider client={client}>
        <RouterProvider rootKey="calendar-locale-test-root">
          <CalendarPageContext>
            <DndProvider backend={HTML5Backend}>
              <CalendarEventEditPage
                eventId={7}
                prefillDate={null}
                onBack={onBack}
                onSaved={onSaved}
                onError={(error, fallback) => onError(error, fallback)}
              />
            </DndProvider>
          </CalendarPageContext>
        </RouterProvider>
      </QueryClientProvider>
    </I18nRuntimeProvider>
  );
  try {
    await act(async () => root.render(view()));
    await act(async () => {
      await vi.waitFor(() => expect(host.querySelector("[data-slate-editor]")).not.toBeNull());
    });
    const editor = harness.editor,
      field = host.querySelector<HTMLInputElement>("input");
    const editable = host.querySelector("[data-slate-editor]");
    if (!editor || !field) throw new Error("日程表单未挂载");
    vi.useFakeTimers();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        field,
        "尚未保存标题"
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
      Transforms.select(editor, { path: [0, 0], offset: 4 });
      editor.insertText("草稿");
    });
    const start = [...host.querySelectorAll("button")].find(button =>
      button.textContent?.startsWith(calendarTranslator.t("event.start"))
    );
    if (!start) throw new Error("开始日期入口未挂载");
    await act(async () => start.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    const pending = byText("20");
    await act(async () => pending.click());
    await act(async () => {
      field.focus();
      field.setSelectionRange(1, 3);
    });
    const body = Node.string(editor);
    const counts = () => ({
      calendars: harness.calendars.mock.calls.length,
      event: harness.event.mock.calls.length,
      reminders: harness.reminders.mock.calls.length,
      update: harness.update.mock.calls.length,
      remove: harness.remove.mock.calls.length,
      setReminders: harness.setReminders.mock.calls.length,
    });
    const calls = counts(),
      keys = client
        .getQueryCache()
        .getAll()
        .map(query => query.queryKey);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => {
        mobileLocaleSource.setLocale(locale);
        root.render(view());
      });
      expect(host.querySelector("input")).toBe(field);
      expect(field.value).toBe("尚未保存标题");
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd]).toEqual([1, 3]);
      expect(harness.editor).toBe(editor);
      expect(host.querySelector("[data-slate-editor]")).toBe(editable);
      expect(Node.string(editor)).toBe(body);
      expect(body).toContain("原始备注草稿");
      expect(byText("20")).toBe(pending);
      expect(pending.getAttribute("aria-pressed")).toBe("true");
      expect(counts()).toEqual(calls);
      expect(
        client
          .getQueryCache()
          .getAll()
          .map(query => query.queryKey)
      ).toEqual(keys);
      expect(onBack).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    }
    await act(async () => byText(mobileI18n.get(dateTimePickerMessages).t("confirm")).click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    await act(async () => byText(calendarTranslator.t("common.cancel")).click());
    expect(onBack).not.toHaveBeenCalled();
    await act(async () => byText(calendarTranslator.t("event.continueEditing")).click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    await act(async () => byText(calendarTranslator.t("event.saveChanges")).click());
    expect(harness.update).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: 7,
        title: "尚未保存标题",
        calendarId: 1,
        detailContentId: 9,
        startDate: new Date(2026, 8, 20).getTime(),
        startTime: 540,
        endDate: null,
        endTime: 600,
        color: "blue",
        allDay: false,
      })
    );
    expect(JSON.stringify(harness.update.mock.calls[0][0].detailContent)).toContain("原始备注草稿");
    expect(onSaved).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    client.clear();
    mobileLocaleSource.setLocale(originalLocale);
    vi.useRealTimers();
    vi.clearAllMocks();
    harness.kit = undefined;
    harness.editor = null;
  }
});

it("主页切换语言保留月份、选中日期和可见日历的查询与存储身份", async () => {
  const originalLocale = mobileLocaleSource.getSnapshot(),
    stored = localStorage.getItem("calendar-visible-ids");
  const client = getQueryClient();
  client.clear();
  mobileLocaleSource.setLocale("zh-CN");
  localStorage.setItem("calendar-visible-ids", "[1,2]");
  const other = { ...calendar, id: 2, title: "截止任务", isInSystemGroup: false };
  harness.calendars.mockResolvedValue([calendar, other]);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const create = vi.fn(),
    open = vi.fn(),
    manage = vi.fn();
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={mobileI18n}>
          <QueryClientProvider client={client}>
            <CalendarHomePage
              onBack={vi.fn()}
              onCreateEvent={create}
              onOpenEvent={open}
              onOpenManage={manage}
            />
          </QueryClientProvider>
        </I18nRuntimeProvider>
      )
    );
    await act(async () => {
      await vi.waitFor(() => expect(harness.events).toHaveBeenCalled());
    });
    await act(async () => byText(other.title).click());
    const next = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${calendarTranslator.t("home.next")}"]`
    );
    if (!next) throw new Error("月份导航未挂载");
    await act(async () => next.click());
    const grid = host.querySelector("#calendar-month-grid");
    const selected = grid?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    const candidate = [...(grid?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
      button => button !== selected
    );
    if (!candidate) throw new Error("日期未挂载");
    await act(async () => candidate.click());
    await act(async () => {
      await vi.waitFor(() => expect(harness.events.mock.lastCall?.[0].calendarIds).toEqual([1]));
    });
    const createButton = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${calendarTranslator.t("event.new")}"]`
    );
    if (!createButton) throw new Error("新建入口未挂载");
    await act(async () => createButton.click());
    const prefillDate = create.mock.calls[0][0];
    create.mockClear();
    const keys = client
      .getQueryCache()
      .getAll()
      .map(query => query.queryKey);
    const calls = {
      calendars: harness.calendars.mock.calls.length,
      events: harness.events.mock.calls.length,
    };
    const value = localStorage.getItem("calendar-visible-ids");
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => mobileLocaleSource.setLocale(locale));
      expect(host.querySelector("#calendar-month-grid")).toBe(grid);
      expect(grid?.querySelector('button[aria-pressed="true"]')).toBe(candidate);
      expect(localStorage.getItem("calendar-visible-ids")).toBe(value);
      expect(
        client
          .getQueryCache()
          .getAll()
          .map(query => query.queryKey)
      ).toEqual(keys);
      expect({
        calendars: harness.calendars.mock.calls.length,
        events: harness.events.mock.calls.length,
      }).toEqual(calls);
      expect(client.getQueryData(["calendar", "calendars"])).toEqual([calendar, other]);
      expect(byText(other.title).getAttribute("aria-pressed")).toBe("false");
      expect(create).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
      expect(manage).not.toHaveBeenCalled();
    }
    const newEvent = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${calendarTranslator.t("event.new")}"]`
    );
    if (!newEvent) throw new Error("新建入口未挂载");
    await act(async () => newEvent.click());
    expect(create).toHaveBeenCalledExactlyOnceWith(prefillDate);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    client.clear();
    mobileLocaleSource.setLocale(originalLocale);
    if (stored === null) localStorage.removeItem("calendar-visible-ids");
    else localStorage.setItem("calendar-visible-ids", stored);
    vi.clearAllMocks();
  }
});
