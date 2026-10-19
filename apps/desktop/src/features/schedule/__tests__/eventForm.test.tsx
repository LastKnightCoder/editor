import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@/types";

const { fetchContent, updateContent, updateEvent, done } = vi.hoisted(() => ({
  fetchContent: vi.fn(),
  updateContent: vi.fn(),
  updateEvent: vi.fn(),
  done: vi.fn(),
}));
vi.mock("@tau/editor", () => ({ Editor: () => null }));
vi.mock("@/services/editorKit", () => ({ getContentKit: () => ({}) }));
vi.mock("../queries", () => ({
  useCalendarCatalog: () => ({ calendars: [{ id: 1, title: "工作", color: "blue" }] }),
  useCalendarKinds: () => new Map(),
  useScheduleCommands: () => ({
    commands: { updateContent },
    assertCurrentDatabase: () => undefined,
  }),
  useScheduleMutations: () => ({ updateEvent }),
  useEventContent: (id: number, enabled: boolean) =>
    useQuery({
      queryKey: ["content", id],
      queryFn: fetchContent,
      enabled,
      retry: false,
    }),
}));

import { useEventForm } from "../components/EventDialog/useEventForm";

const event: CalendarEvent = {
  id: 1,
  title: "原始标题",
  calendarId: 1,
  startDate: new Date(2026, 8, 30).getTime(),
  endDate: null,
  startTime: null,
  endTime: null,
  allDay: true,
  color: null,
  detailContentId: 9,
  createTime: 0,
  updateTime: 0,
};
const description = [{ type: "paragraph", children: [{ type: "formatted", text: "备注" }] }];
let root: Root | undefined;
let host: HTMLDivElement;
let client: QueryClient;
let form: ReturnType<typeof useEventForm>;

function Probe() {
  form = useEventForm(event, done);
  return form.fields;
}
beforeEach(() => {
  fetchContent.mockReset();
  updateContent.mockReset();
  updateEvent.mockReset();
  done.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  host?.remove();
  client.clear();
});
async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>
    )
  );
}
function changeTitle(value: string) {
  const input = host.querySelector<HTMLInputElement>('input[placeholder="日程标题"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!input || !setter) throw new Error("未找到标题输入框");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("日程表单数据接线", () => {
  it("备注迟到时保留已经输入的标题；保存失败不关闭表单", async () => {
    let finish!: (value: unknown) => void;
    fetchContent.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    await mount();
    await act(async () => changeTitle("修改后的标题"));
    await act(async () => finish({ content: description }));
    await act(async () => {
      await vi.waitFor(() => expect(form.canSave).toBe(true));
    });
    expect(host.querySelector<HTMLInputElement>('input[placeholder="日程标题"]')?.value).toBe(
      "修改后的标题"
    );
    updateContent.mockResolvedValue(undefined);
    updateEvent.mockRejectedValue(new Error("保存失败"));
    await act(async () => {
      await form.save();
    });
    expect(updateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ title: "修改后的标题", detailContentId: 9 })
    );
    expect(done).not.toHaveBeenCalled();
    expect(form.saving).toBe(false);
  });

  it("备注读取失败时禁止保存空正文，重试成功后才开放保存", async () => {
    fetchContent.mockRejectedValueOnce(new Error("读取失败"));
    await mount();
    await act(async () => {
      await vi.waitFor(() => expect(host.querySelector('[role="alert"]')).not.toBeNull());
    });
    expect(form.canSave).toBe(false);
    expect(updateContent).not.toHaveBeenCalled();
    fetchContent.mockResolvedValueOnce({ content: description });
    await act(async () => host.querySelector<HTMLButtonElement>("button")?.click());
    await act(async () => {
      await vi.waitFor(() => expect(form.canSave).toBe(true));
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
