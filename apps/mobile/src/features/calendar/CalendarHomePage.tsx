// 日历主页（定稿：D 交互 + A 视觉）——月份标题/把手均可逆切换月历与选中周条，
// 切换保留选中日与列表位置；月历 6 周范围一次拉取，彩点与列表同源派生。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ListPlus, Plus } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { useThemeStore } from "@tau/themes/react";
import { useEdgeFade } from "../../hooks/useScrollState";
import { eventColorValue } from "./constants";
import { useCalendars, useCalendarEventsByRange } from "./queries";
import {
  addDays,
  eventOccursOnDay,
  formatDayHead,
  formatMonthNav,
  getMonthGrid,
  todayStart,
} from "./utils";
import { MonthGrid } from "./components/MonthGrid";
import { EventListSection } from "./components/EventListSection";
import { CalendarFilterChips } from "./components/CalendarFilterChips";
import type { CalendarEvent } from "./types";

const VISIBLE_IDS_STORAGE_KEY = "calendar-visible-ids";

type CalendarHomePageProps = {
  onBack: () => void;
  onCreateEvent: (prefillDate: number) => void;
  onOpenEvent: (eventId: number) => void;
  onOpenManage: () => void;
};

/** 初始化可见日历：localStorage 优先（过滤失效 id），否则取服务端 visible（对齐桌面启动全选可见语义）。
 *  新出现的日历 id 默认并入勾选（对齐桌面「新日历默认勾选」）：主页是保活页，
 *  跨页写 localStorage 会被本页 state 回写覆盖，新日历必须由本页自己吸收 */
function useVisibleCalendarIds(calendars: { id: number; visible: boolean }[]) {
  const [visibleIds, setVisibleIds] = useState<number[] | null>(null);
  const ready = calendars.length > 0;
  const knownIdsRef = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (visibleIds !== null || !ready) {
      return;
    }
    const stored = localStorage.getItem(VISIBLE_IDS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as number[];
        if (Array.isArray(parsed)) {
          setVisibleIds(parsed.filter(id => calendars.some(calendar => calendar.id === id)));
          return;
        }
      } catch {
        // 坏数据走默认全选可见
      }
    }
    setVisibleIds(calendars.filter(calendar => calendar.visible).map(calendar => calendar.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, visibleIds]);

  useEffect(() => {
    if (visibleIds !== null) {
      localStorage.setItem(VISIBLE_IDS_STORAGE_KEY, JSON.stringify(visibleIds));
    }
  }, [visibleIds]);

  // 新日历默认并入勾选（对齐桌面）：管理页新建日历 → invalidate → calendars 刷新出现新 id
  useEffect(() => {
    if (!ready) {
      return;
    }
    const known = knownIdsRef.current;
    if (known === null) {
      // 首次见到日历列表：全部记为已知，不算「新日历」（否则会覆盖 localStorage 白名单）
      knownIdsRef.current = new Set(calendars.map(calendar => calendar.id));
      return;
    }
    const newIds = calendars
      .filter(calendar => !known.has(calendar.id) && calendar.visible)
      .map(calendar => calendar.id);
    calendars.forEach(calendar => known.add(calendar.id));
    if (newIds.length > 0) {
      setVisibleIds(previous => {
        const current =
          previous ?? calendars.filter(calendar => calendar.visible).map(calendar => calendar.id);
        return current.concat(newIds.filter(id => !current.includes(id)));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendars, ready]);

  const fallback = useMemo(
    () => calendars.filter(calendar => calendar.visible).map(calendar => calendar.id),
    [calendars]
  );
  return [visibleIds ?? fallback, setVisibleIds] as const;
}

export function CalendarHomePage({
  onBack,
  onCreateEvent,
  onOpenEvent,
  onOpenManage,
}: CalendarHomePageProps) {
  const isDark = useThemeStore(s => s.mode === "dark");
  const calendarsQuery = useCalendars();
  const { data: calendars = [] } = calendarsQuery;
  const [expanded, setExpanded] = useState(() => window.innerHeight >= 700);
  const [anchorMonth, setAnchorMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  });
  const [selectedDate, setSelectedDate] = useState(() => todayStart());
  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });
  const [visibleIds, setVisibleIds] = useVisibleCalendarIds(calendars);

  // 分钟级「现在」刷新（对齐桌面 WeekView 时间线的列表化简化）
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // 月历可视 6 周范围一次拉取：彩点与选中日列表同源派生，避免重复请求。
  // 日历列表就绪后查询；空 ids 表示用户全不勾选。
  const grid = useMemo(() => getMonthGrid(anchorMonth), [anchorMonth]);
  const rangeStart = grid[0].date;
  const rangeEnd = addDays(grid[grid.length - 1].date, 1) - 1;
  const eventsQuery = useCalendarEventsByRange({
    startDate: rangeStart,
    endDate: rangeEnd,
    calendarIds: visibleIds,
    enabled: calendars.length > 0,
  });
  const { data: rangeEvents = [] } = eventsQuery;

  const selectedEvents = useMemo(
    () => rangeEvents.filter(event => eventOccursOnDay(event, selectedDate)),
    [rangeEvents, selectedDate]
  );
  const allDayCount = selectedEvents.filter(event => event.allDay).length;
  const dayHead = formatDayHead(selectedDate);
  const monthNav = formatMonthNav(anchorMonth);

  const resolveColor = useCallback(
    (event: CalendarEvent) => eventColorValue(event.color, event.calendarColor, isDark),
    [isDark]
  );

  const shiftMonth = useCallback(
    (delta: number) => {
      const date = new Date(anchorMonth);
      const target = new Date(date.getFullYear(), date.getMonth() + delta, 1);
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      setAnchorMonth(target.getTime());
      setSelectedDate(
        new Date(
          target.getFullYear(),
          target.getMonth(),
          Math.min(new Date(selectedDate).getDate(), lastDay)
        ).getTime()
      );
    },
    [anchorMonth, selectedDate]
  );

  // 收起态（只看得见选中周）横滑走一周：移到相邻周并让月份跟随选中日，
  // 跨月的那一周也能正确落在新月网格里（选中日一定在 anchor 月内，故其所在周必然可见）
  const shiftWeek = useCallback(
    (delta: number) => {
      const target = addDays(selectedDate, delta * 7);
      const date = new Date(target);
      setSelectedDate(target);
      setAnchorMonth(new Date(date.getFullYear(), date.getMonth(), 1).getTime());
    },
    [selectedDate]
  );

  const goToday = useCallback(() => {
    const today = todayStart();
    setSelectedDate(today);
    const now = new Date();
    setAnchorMonth(new Date(now.getFullYear(), now.getMonth(), 1).getTime());
  }, []);

  // 月历左右滑：看得见整月时走一月，只看得见选中周时走一周（对齐日记月历手势习惯）。
  // 月历现在住在整页滚动容器里，纵向滚动时手指常带横向漂移，故横向位移必须压过纵向才算横滑
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }, []);
  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (start === null) {
        return;
      }
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) {
        return;
      }
      const step = deltaX < 0 ? 1 : -1;
      if (expanded) {
        shiftMonth(step);
      } else {
        shiftWeek(step);
      }
    },
    [expanded, shiftMonth, shiftWeek]
  );

  // 把手拖拽：上拖收起、下拖展开（点按仍是切换）。拖拽只让把手跟手位移——月历是
  // 「整月 6 行 / 仅选中周」两态切换，逐像素跟手会把中间周行裁掉再弹回，反而更晃；
  // 松手过位移阈值（或轻扫速度阈值，量级对齐 useSheetDragDismiss）才换态，
  // 换态的展开/收起交给 max-height 弹性动画。
  const dragStartY = useRef<number | null>(null);
  const dragLastRef = useRef({ y: 0, ts: 0 });
  const dragVelocity = useRef(0);
  const dragMoved = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);
  const onHandlePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    // isPrimary 用 === false 判定：多指时只有主指接管，而 jsdom 派发的合成事件没有该字段
    if (event.isPrimary === false) {
      return;
    }
    // 指针捕获保证手指移出把手也继续收到 move/up；jsdom 未实现该 API，降级为不捕获
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStartY.current = event.clientY;
    dragLastRef.current = { y: event.clientY, ts: event.timeStamp };
    dragVelocity.current = 0;
    dragMoved.current = false;
  }, []);
  const onHandlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (dragStartY.current === null) {
        return;
      }
      const delta = event.clientY - dragStartY.current;
      if (Math.abs(delta) > 6) {
        dragMoved.current = true;
      }
      const dt = event.timeStamp - dragLastRef.current.ts;
      if (dt > 0) {
        dragVelocity.current = (event.clientY - dragLastRef.current.y) / dt;
        dragLastRef.current = { y: event.clientY, ts: event.timeStamp };
      }
      // 已经在该方向的尽头（收起态继续上拖 / 展开态继续下拖）只给阻尼位移，不再跟手
      const atEnd = (delta < 0 && !expanded) || (delta > 0 && expanded);
      setDragOffset(Math.max(-20, Math.min(20, delta * (atEnd ? 0.15 : 0.4))));
    },
    [expanded]
  );
  const endHandleDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const start = dragStartY.current;
    dragStartY.current = null;
    setDragOffset(0);
    if (start === null) {
      return;
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const delta = event.clientY - start;
    const byDistance = Math.abs(delta) >= 26;
    const byVelocity = Math.abs(dragVelocity.current) >= 0.35 && Math.abs(delta) >= 12;
    if (!byDistance && !byVelocity) {
      return;
    }
    // 位移够看位移方向，只够速度时看速度方向；上 = 收起，下 = 展开
    setExpanded(byDistance ? delta > 0 : dragVelocity.current > 0);
  }, []);
  const onHandleClick = useCallback(() => {
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    setExpanded(previous => !previous);
  }, []);

  // 折叠动画：max-height + opacity 过渡（对齐定稿 elastic-month 弹性曲线）；
  // 折叠时月历网格只渲染选中周行（week-only）。整页单滚动后此处只用 max-height 裁剪，
  // 不再自带滚动条（否则又变成「网格内滚动 + 列表内滚动」的两段式）
  const expandLabel = expanded ? "收起月历" : "展开月历";
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEdgeFade(scrollRef);

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader
        title="日历"
        onBack={onBack}
        actions={
          <>
            <button
              type="button"
              aria-label="日历管理"
              onClick={onOpenManage}
              className="text-ink-1 active:bg-press grid h-10 w-10 place-items-center rounded-full transition active:scale-90"
            >
              <ListPlus size={22} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              aria-label="新建日程"
              onClick={() => onCreateEvent(selectedDate)}
              className="shadow-lift text-ink-inverse grid h-10 w-10 place-items-center rounded-[13px] transition active:scale-90"
              style={{ background: "var(--tau-accent)" }}
            >
              <Plus size={22} strokeWidth={2.4} />
            </button>
          </>
        }
      />

      {/* 整页单一滚动容器：顶栏固定，月份导航/月历/过滤条/日期头/日程列表一起滚 */}
      <div
        ref={scrollRef}
        className="edge-fade-scroll mobile-page-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
      >
        <div className="flex flex-none items-center justify-between px-[18px] pb-0.5 pt-1">
          <button
            type="button"
            className="text-ink-1 min-h-[44px] cursor-pointer text-left text-[20px] font-extrabold tracking-[0.3px]"
            onClick={() => setExpanded(previous => !previous)}
            aria-expanded={expanded}
            aria-controls="calendar-month-grid"
            title={expandLabel}
          >
            {monthNav.main}
            <small className="text-ink-2 ml-2 text-[12.5px] font-semibold">{monthNav.sub}</small>
          </button>
          <span className="flex gap-2">
            <button
              type="button"
              aria-label="上一月"
              onClick={() => shiftMonth(-1)}
              className="bg-surface shadow-card text-ink-1 grid h-8 w-8 place-items-center rounded-full"
            >
              <ChevronLeft size={16} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="text-accent bg-accent-soft h-8 rounded-full px-3.5 text-[12.5px] font-extrabold"
            >
              今天
            </button>
            <button
              type="button"
              aria-label="下一月"
              onClick={() => shiftMonth(1)}
              className="bg-surface shadow-card text-ink-1 grid h-8 w-8 place-items-center rounded-full"
            >
              <ChevronRight size={16} strokeWidth={2.4} />
            </button>
          </span>
        </div>

        <div
          className="shrink-0 overflow-hidden transition-[max-height] duration-[450ms] ease-[cubic-bezier(0.34,1.3,0.5,1)]"
          // 420 / 110 是裁剪高度而非目标高度：必须分别盖住月历自然高度（六周 ≈ 410、单周 ≈ 90），
          // 否则展开/收起会被截断。格高或周标题高度变了要同步这两个值。
          style={{ maxHeight: expanded ? 420 : 110 }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <MonthGrid
            anchorDate={anchorMonth}
            selectedDate={selectedDate}
            today={todayStart()}
            events={rangeEvents}
            expanded={expanded}
            resolveColor={resolveColor}
            onSelectDate={setSelectedDate}
          />
        </div>

        {/* touch-none：把手独占纵向手势，避免拖拽把手时整页跟着滚 */}
        <button
          type="button"
          className="flex min-h-[44px] w-full flex-none touch-none items-center justify-center border-0 bg-transparent"
          style={{
            transform: `translateY(${dragOffset}px)`,
            transition: dragOffset ? "none" : "transform 260ms",
          }}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endHandleDrag}
          onPointerCancel={endHandleDrag}
          onClick={onHandleClick}
          aria-expanded={expanded}
          aria-controls="calendar-month-grid"
          aria-label={expandLabel}
          title={expandLabel}
        >
          <span className="h-[4.5px] w-10 rounded-full bg-[var(--tau-line-1)]" />
        </button>

        <CalendarFilterChips
          calendars={calendars.filter(calendar => !calendar.archived)}
          visibleIds={visibleIds}
          onToggle={calendar =>
            setVisibleIds(previous => {
              const current = previous ?? [];
              const toggled = current.includes(calendar.id)
                ? current.filter(id => id !== calendar.id)
                : [...current, calendar.id];
              // 按日历列表原序重排：visibleIds 是 queryKey 一部分，顺序不同会产生重复缓存
              return calendars.filter(item => toggled.includes(item.id)).map(item => item.id);
            })
          }
        />

        <div className="text-ink-1 flex flex-none items-baseline gap-2 px-5 pb-1.5 pt-3.5">
          <span className="text-[16px] font-extrabold">{dayHead.day}</span>
          <span className="text-accent text-[12px] font-bold">{dayHead.weekday}</span>
          <span className="text-ink-3 ml-auto text-[11.5px] font-bold">
            {selectedEvents.length === 0
              ? "无日程"
              : `${selectedEvents.length} 件日程${allDayCount > 0 ? ` · ${allDayCount} 件全天` : ""}`}
          </span>
        </div>

        <div className="min-h-[160px] flex-1">
          {calendarsQuery.isError || eventsQuery.isError ? (
            <div role="alert" className="text-ink-2 p-5 text-center text-sm">
              <p>日程加载失败</p>
              <button
                type="button"
                className="text-accent mt-2 min-h-11 px-4"
                onClick={() => {
                  void calendarsQuery.refetch();
                  void eventsQuery.refetch();
                }}
              >
                重试
              </button>
            </div>
          ) : calendarsQuery.isPending || eventsQuery.isLoading ? (
            <p role="status" className="text-ink-3 p-5 text-center text-sm">
              加载中…
            </p>
          ) : (
            <EventListSection
              events={selectedEvents}
              selectedDate={selectedDate}
              nowMinutes={nowMinutes}
              resolveColor={resolveColor}
              onSelectEvent={event => onOpenEvent(event.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
