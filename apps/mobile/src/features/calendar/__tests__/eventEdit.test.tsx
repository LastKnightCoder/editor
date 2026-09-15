import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarEventEditPage } from "../CalendarEventEditPage";

const content = (text: string) => [{ type: "paragraph", children: [{ type: "formatted", text }] }];
const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), invalidate: vi.fn() }));
vi.mock("../../../services/tauri", () => ({
  calendarEventGetById: mocks.get,
  calendarEventUpdate: mocks.update,
}));
vi.mock("../queries", () => ({
  useCalendars: () => ({ data: [{ id: 1, title: "工作", color: "blue" }] }),
  invalidateCalendarQueries: mocks.invalidate,
}));
vi.mock("../../../router", () => ({ useBackHandler: vi.fn() }));
vi.mock("../../../hooks/useScrollState", () => ({ useEdgeFade: vi.fn() }));
vi.mock("../../cards/editorExtensions", () => ({ mobileCardPreviewExtensions: [] }));
vi.mock("../../cards/editorToolbar/useMobileEditorToolbarController", () => ({
  useMobileEditorToolbarController: () => ({ syncSelection: vi.fn() }),
}));
vi.mock("../../cards/editorToolbar/MobileEditorBottomToolbar", () => ({
  MobileEditorBottomToolbar: () => null,
}));
vi.mock("../../../components/DateTimePickerSheet", () => ({ DateTimePickerSheet: () => null }));
vi.mock("../components/CalendarPickerSheet", () => ({ CalendarPickerSheet: () => null }));
vi.mock("../components/ColorPickerSheet", () => ({ ColorPickerSheet: () => null }));
vi.mock("../../../components/MobileConfirmDialog", () => ({
  MobileConfirmDialog: ({ open, description }: { open: boolean; description: string }) =>
    open ? <div>{description}</div> : null,
}));
vi.mock("@tau/editor/src", () => ({
  Editor: ({ initValue, onChange }: { initValue: unknown; onChange: (value: unknown) => void }) => (
    <button data-editor onClick={() => onChange(content("修改后的详情"))}>
      {JSON.stringify(initValue)}
    </button>
  ),
}));

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  vi.clearAllMocks();
});

async function setup() {
  mocks.get.mockResolvedValue({
    id: 7,
    title: "会议",
    calendarId: 1,
    allDay: true,
    startDate: Date.now(),
    endDate: null,
    startTime: null,
    endTime: null,
    color: null,
    value: null,
    detailContentId: 9,
    detailContent: content("原有详情"),
  });
  mocks.update.mockResolvedValue({});
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onSaved = vi.fn();
  const onBack = vi.fn();
  await act(async () =>
    root.render(
      <CalendarEventEditPage
        eventId={7}
        prefillDate={null}
        onBack={onBack}
        onSaved={onSaved}
        onError={vi.fn()}
      />
    )
  );
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  const click = async (label: string) => {
    const button = [...host.querySelectorAll("button")].find(
      node => node.textContent?.trim() === label
    );
    if (!button) {
      throw new Error(`未找到按钮：${label}`);
    }
    await act(async () => button.click());
  };
  return { host, click, onSaved, onBack };
}

describe("日程详情编辑", () => {
  it("回填已有详情，未修改正文时保留内容 ID", async () => {
    const { host, click, onSaved } = await setup();
    expect(host.querySelector("[data-editor]")?.textContent).toContain("原有详情");
    await click("保存修改");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, detailContentId: 9 })
    );
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("detailContent");
    expect(onSaved).toHaveBeenCalled();
  });

  it("正文修改参与退出确认并随日程一起保存", async () => {
    const { host, click, onBack } = await setup();
    const editorTrigger = host.querySelector<HTMLButtonElement>("[data-editor]");
    if (!editorTrigger) {
      throw new Error("未渲染详情编辑器");
    }
    await act(async () => editorTrigger.click());
    await click("取消");
    expect(onBack).not.toHaveBeenCalled();
    expect(host.textContent).toContain("当前改动尚未保存");
    await click("保存修改");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ detailContent: content("修改后的详情"), detailContentCount: 6 })
    );
  });
});
