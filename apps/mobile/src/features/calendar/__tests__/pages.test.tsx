import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Calendar, CalendarEvent } from "../types";
import { CalendarHomePage } from "../CalendarHomePage";
import { CalendarEventDetailPage } from "../CalendarEventDetailPage";
import { CalendarEventEditPage } from "../CalendarEventEditPage";

const state = vi.hoisted(() => ({
  event: null as CalendarEvent | null,
  failed: false,
  refetch: vi.fn(),
}));
const calendar = {
  id: 1,
  title: "工作",
  color: "blue",
  visible: true,
  archived: false,
} as Calendar;
vi.mock("../queries", () => ({
  useCalendars: () => ({ data: [calendar], refetch: state.refetch }),
  useCalendarEventsByRange: () => ({ data: [], isError: state.failed, refetch: state.refetch }),
  useCalendarEventById: () => ({ data: state.event }),
}));
vi.mock("../../../services/tauri", () => ({
  calendarEventGetById: () => Promise.resolve(state.event),
}));
vi.mock("../../../router", () => ({ useBackHandler: () => () => {} }));
vi.mock("../../../components/ActionSheet", () => ({ ActionSheet: () => null }));
vi.mock("../../../components/MobileConfirmDialog", () => ({ MobileConfirmDialog: () => null }));
vi.mock("../../cards/editorToolbar/MobileEditorBottomToolbar", () => ({
  MobileEditorBottomToolbar: () => null,
}));
vi.mock("../../cards/editorExtensions", () => ({ mobileCardPreviewExtensions: [] }));
// 页面测试不渲染真实编辑器，kit 也不必真实构造
vi.mock("../../../services/editorKit", () => ({
  getMobileContentKit: () => ({}),
  useMobileContentKit: () => ({}),
  getMobileFlashcardKit: () => ({}),
}));
vi.mock("@tau/editor", () => ({
  createValueDocument: (initialValue: unknown) => ({ initialValue }),
  Editor: ({
    initValue,
    document,
  }: {
    initValue?: unknown;
    document?: { initialValue: unknown };
  }) => <div data-testid="editor">{JSON.stringify(document?.initialValue ?? initValue)}</div>,
}));

let host: HTMLDivElement;
let root: Root;
const render = (element: ReactElement) => act(() => root.render(element));
const click = (label: string) =>
  act(() => {
    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(button).not.toBeNull();
    button!.click();
  });
const monthCells = () => host.querySelectorAll("#calendar-month-grid button").length;
/** jsdom 没有 PointerEvent：用 MouseEvent 派发同名事件，React 的 onPointer* 仍会读到 clientY */
const dragHandle = (label: string, deltaY: number) =>
  act(() => {
    const el = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(el).not.toBeNull();
    const withY = (type: string, clientY: number) =>
      new MouseEvent(type, { bubbles: true, clientY });
    el!.dispatchEvent(withY("pointerdown", 300));
    el!.dispatchEvent(withY("pointermove", 300 + deltaY));
    el!.dispatchEvent(withY("pointerup", 300 + deltaY));
  });

/** jsdom 没有 TouchEvent：挂上 touches/changedTouches 后按原生事件名派发即可 */
const swipeGrid = (deltaX: number) =>
  act(() => {
    const grid = host.querySelector("#calendar-month-grid");
    expect(grid).not.toBeNull();
    const fire = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true });
      const touch = [{ clientX, clientY: 200 }];
      Object.defineProperty(event, "touches", { value: touch });
      Object.defineProperty(event, "changedTouches", { value: touch });
      grid!.dispatchEvent(event);
    };
    fire("touchstart", 200);
    fire("touchend", 200 + deltaX);
  });
const monthTitle = () => host.textContent?.match(/\d{4}年\d{1,2}月/)?.[0];
const selectedCell = () =>
  host.querySelector('#calendar-month-grid button[aria-pressed="true"]')?.textContent;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 31, 12));
  localStorage.clear();
  state.failed = false;
  state.refetch.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("日历页面回归", () => {
  it("小屏默认选中周，仍能展开完整月历", () => {
    const height = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 568 });
    try {
      render(
        <CalendarHomePage
          onBack={vi.fn()}
          onCreateEvent={vi.fn()}
          onOpenEvent={vi.fn()}
          onOpenManage={vi.fn()}
        />
      );
      expect(host.querySelectorAll("#calendar-month-grid button")).toHaveLength(7);
      click("展开月历");
      expect(host.querySelectorAll("#calendar-month-grid button")).toHaveLength(42);
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    }
  });

  it("横滑：展开态换月，收起态只换一周（跨月时月份跟随）", () => {
    const height = window.innerHeight;
    try {
      // 展开态：看得见整月，横滑走一月
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
      render(
        <CalendarHomePage
          onBack={vi.fn()}
          onCreateEvent={vi.fn()}
          onOpenEvent={vi.fn()}
          onOpenManage={vi.fn()}
        />
      );
      expect(monthTitle()).toBe("2026年1月");
      swipeGrid(-120);
      expect(monthTitle()).toBe("2026年2月");

      // 收起态：只看得见选中周，横滑走一周（1月31日 → 2月7日），月份跟随选中日
      act(() => root.unmount());
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 568 });
      root = createRoot(host);
      render(
        <CalendarHomePage
          onBack={vi.fn()}
          onCreateEvent={vi.fn()}
          onOpenEvent={vi.fn()}
          onOpenManage={vi.fn()}
        />
      );
      expect(monthCells()).toBe(7);
      expect(selectedCell()).toContain("31");
      swipeGrid(-120);
      expect(selectedCell()).toContain("7");
      expect(monthTitle()).toBe("2026年2月");
      // 反向再滑回上一周，跨回 1 月
      swipeGrid(120);
      expect(selectedCell()).toContain("31");
      expect(monthTitle()).toBe("2026年1月");
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    }
  });

  it("把手可上下拖拽收起/展开月历，拖后的 click 不会二次切换", () => {
    const height = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    try {
      render(
        <CalendarHomePage
          onBack={vi.fn()}
          onCreateEvent={vi.fn()}
          onOpenEvent={vi.fn()}
          onOpenManage={vi.fn()}
        />
      );
      expect(monthCells()).toBe(42);
      // 上拖 80px → 收起为选中周
      dragHandle("收起月历", -80);
      expect(monthCells()).toBe(7);
      // 浏览器在 pointerup 后补发的 click 不应再切换一次
      click("展开月历");
      expect(monthCells()).toBe(7);
      // 展开态下拖 80px → 重新展开
      dragHandle("展开月历", 80);
      expect(monthCells()).toBe(42);
      // 位移不足阈值（速度也接近 0）→ 不换态
      dragHandle("收起月历", -18);
      expect(monthCells()).toBe(42);
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    }
  });

  it("翻月同时更新选中日和新建预填，并钳制月末", () => {
    const create = vi.fn();
    render(
      <CalendarHomePage
        onBack={vi.fn()}
        onCreateEvent={create}
        onOpenEvent={vi.fn()}
        onOpenManage={vi.fn()}
      />
    );
    click("下一月");
    expect(
      host.querySelector('#calendar-month-grid button[aria-pressed="true"]')?.textContent
    ).toContain("28");
    click("新建日程");
    expect(create).toHaveBeenLastCalledWith(new Date(2026, 1, 28).getTime());
    click("收起月历");
    expect(host.querySelectorAll("#calendar-month-grid button")).toHaveLength(7);
    click("下一月");
    click("新建日程");
    expect(create).toHaveBeenLastCalledWith(new Date(2026, 2, 28).getTime());
  });

  it("物化失败展示重试入口，不伪装成无日程", () => {
    state.failed = true;
    render(
      <CalendarHomePage
        onBack={vi.fn()}
        onCreateEvent={vi.fn()}
        onOpenEvent={vi.fn()}
        onOpenManage={vi.fn()}
      />
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("日程加载失败");
    expect(host.textContent).not.toContain("这天没有日程");
    act(() => host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
    expect(state.refetch).toHaveBeenCalledTimes(2);
  });

  it("同步后更新正文，并完整展示跨天系统日程起止时刻", () => {
    state.event = {
      id: 1,
      calendarId: 1,
      title: "跨天",
      startDate: new Date(2026, 8, 15).getTime(),
      endDate: new Date(2026, 8, 16).getTime(),
      startTime: 1380,
      endTime: 60,
      allDay: false,
      isInSystemEvent: true,
      detailContent: [{ children: [{ text: "旧正文" }] }],
    } as CalendarEvent;
    const page = () => (
      <CalendarEventDetailPage
        eventId={1}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onOpenPomodoroHistory={vi.fn()}
        onOpenTodo={vi.fn()}
      />
    );
    render(page());
    expect(host.textContent).toContain("23:00");
    expect(host.textContent).toContain("01:00");
    const editor = host.querySelector('[data-testid="editor"]');
    state.event = { ...state.event, detailContent: [{ children: [{ text: "新正文" }] }] };
    render(page());
    expect(host.querySelector('[data-testid="editor"]')).toBe(editor);
    expect(editor?.textContent).toContain("新正文");
    expect(editor?.textContent).not.toContain("旧正文");
  });

  it("系统日程详情：不可滚动无边缘渐隐，末行不画分隔线，日历行不带颜色文案", () => {
    const openHistory = vi.fn();
    state.event = {
      id: 2,
      calendarId: 1,
      title: "🍅 深度工作",
      startDate: new Date(2026, 8, 15).getTime(),
      endDate: null,
      startTime: 540,
      endTime: 565,
      allDay: false,
      color: null,
      calendarTitle: "番茄钟",
      calendarColor: "red",
      isInSystemEvent: true,
    } as CalendarEvent;
    render(
      <CalendarEventDetailPage
        eventId={2}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onOpenPomodoroHistory={openHistory}
        onOpenTodo={vi.fn()}
      />
    );

    // 内容不足一屏：渐隐带变量两侧关闭（缺省 1 会让不可滚页面常显顶部渐隐）
    const scroller = host.querySelector<HTMLElement>(".edge-fade-scroll");
    expect(scroller).not.toBeNull();
    expect(scroller!.style.getPropertyValue("--edge-top-on")).toBe("0");
    expect(scroller!.style.getPropertyValue("--edge-bottom-on")).toBe("0");

    // 日历行即末行，分隔线必须收起
    const ruledRows = [...host.querySelectorAll<HTMLElement>(".border-b")];
    expect(ruledRows).toHaveLength(2);
    expect(ruledRows[1].className).toContain("last:border-b-0");

    // 日历行只留日历名：信息卡内不再复述颜色文案（页头已有归属色点）
    expect(host.textContent).toContain("番茄钟");
    expect(host.textContent).not.toContain("日历 ·");
    expect(host.querySelectorAll("i.rounded-full")).toHaveLength(1);

    // 专注记录入口携带该日程日期，供历史页聚焦当天的记录
    act(() => {
      [...host.querySelectorAll("button")]
        .find(button => button.textContent?.includes("查看番茄钟专注记录"))
        ?.click();
    });
    expect(openHistory).toHaveBeenCalledWith(new Date(2026, 8, 15).getTime());
  });

  it("日历筛选条：左右间距挂外层，滚动层接横向渐隐并隐藏滚动条", () => {
    render(
      <CalendarHomePage
        onBack={vi.fn()}
        onCreateEvent={vi.fn()}
        onOpenEvent={vi.fn()}
        onOpenManage={vi.fn()}
      />
    );
    const scroller = host.querySelector<HTMLElement>(".edge-fade-x-scroll");
    expect(scroller).not.toBeNull();
    // padding 必须在滚动层之外：挂在滚动容器上时 chip 滚到中间会贴屏幕边缘
    expect(scroller!.className).not.toContain("px-[18px]");
    expect(scroller!.parentElement?.className).toContain("px-[18px]");
    // scrollbar-none 在项目里没有定义，隐藏滚动条只能靠 scrollbar-hide
    expect(scroller!.className).toContain("scrollbar-hide");
    expect(scroller!.className).not.toContain("scrollbar-none");
    // 内容不足一屏（jsdom 无布局，宽度按 0 算）→ 两端无渐隐带
    expect(scroller!.style.getPropertyValue("--edge-x-start-on")).toBe("0");
    expect(scroller!.style.getPropertyValue("--edge-x-end-on")).toBe("0");
  });

  it("数据到达后才渲染滚动容器：元素到位即接管，滚动状态照常收放", () => {
    const page = () => (
      <CalendarEventDetailPage
        eventId={3}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onOpenPomodoroHistory={vi.fn()}
        onOpenTodo={vi.fn()}
      />
    );
    // 加载态是早退分支，此时页面上没有滚动容器
    state.event = null;
    render(page());
    expect(host.querySelector(".edge-fade-scroll")).toBeNull();

    // 数据到达 → 容器出现：渐隐变量必须被写出来（停在"未写入"就只能靠 CSS 缺省兜底）
    state.event = {
      id: 3,
      calendarId: 1,
      title: "番茄专注",
      startDate: new Date(2026, 8, 15).getTime(),
      endDate: null,
      startTime: 600,
      endTime: 625,
      allDay: false,
      color: null,
      calendarTitle: "番茄钟",
      calendarColor: "red",
      isInSystemEvent: true,
    } as CalendarEvent;
    render(page());
    const scroller = host.querySelector<HTMLElement>(".edge-fade-scroll");
    expect(scroller).not.toBeNull();
    expect(scroller!.style.getPropertyValue("--edge-top-on")).toBe("0");
    expect(scroller!.style.getPropertyValue("--edge-bottom-on")).toBe("0");

    // 监听也要挂在晚到的元素上：撑高内容并滚动后，底部带应随之打开
    Object.defineProperty(scroller, "scrollHeight", { value: 1200, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 600, configurable: true });
    act(() => {
      scroller!.dispatchEvent(new Event("scroll"));
    });
    expect(scroller!.style.getPropertyValue("--edge-top-on")).toBe("0");
    expect(scroller!.style.getPropertyValue("--edge-bottom-on")).toBe("1");
  });

  it("编辑日程页：异步回填后才渲染滚动容器，元素到位即接管", async () => {
    state.event = {
      id: 5,
      calendarId: 1,
      title: "周会",
      startDate: new Date(2026, 8, 15).getTime(),
      endDate: null,
      startTime: 600,
      endTime: 660,
      allDay: false,
      color: null,
      detailContentId: 0,
    } as CalendarEvent;
    render(
      <CalendarEventEditPage
        eventId={5}
        prefillDate={null}
        onBack={vi.fn()}
        onSaved={vi.fn()}
        onError={vi.fn()}
      />
    );
    // 加载中走早退分支，此时还没有滚动容器
    expect(host.querySelector(".edge-fade-scroll")).toBeNull();

    await act(async () => {
      await Promise.resolve();
    });
    const scroller = host.querySelector<HTMLElement>(".edge-fade-scroll");
    expect(scroller).not.toBeNull();
    expect(scroller!.style.getPropertyValue("--edge-top-on")).toBe("0");
    expect(scroller!.style.getPropertyValue("--edge-bottom-on")).toBe("0");
  });
});
