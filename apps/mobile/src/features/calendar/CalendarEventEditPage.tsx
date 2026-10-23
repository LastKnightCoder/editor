// 新建/编辑日程页（定稿 A 分区卡片表单）：标题/时间（全天开关）/归属与外观/数值/详情；
// 三类选择统一 BottomSheet（内置返回拦截）；未保存改动经 requestExit 确认，
// 顶栏取消与系统返回手势走同一入口（对齐闪卡 cardEdit 审查修复项）。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMobileContentKit } from "../../services/editorKit";
import { CalendarX2, Trash2 } from "lucide-react";
import { Editor, type EditorRef } from "@tau/editor";
import type { Descendant } from "slate";
import {
  createEmptyEditorContent,
  normalizeEditorContent,
  getContentLength,
} from "../cards/editorContentUtils";
import { MobileEditorBottomToolbar } from "../cards/editorToolbar/MobileEditorBottomToolbar";
import { useMobileEditorToolbarController } from "../cards/editorToolbar/useMobileEditorToolbarController";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { DateTimePickerSheet } from "../../components/DateTimePickerSheet";
import { useBackHandler } from "../../router";
import { useThemeStore } from "@tau/themes/react";
import { useEdgeFade } from "../../hooks/useScrollState";
import { calendarColorLabel, eventColorValue } from "./constants";
import { useCalendars, invalidateCalendarQueries } from "./queries";
import * as tauri from "../../services/tauri";
import {
  atLocalTime,
  dayStart,
  formatDateTimeLine,
  formatMonthDay,
  formatTime,
  weekdayLabel,
} from "./utils";
import { CalendarPickerSheet } from "./components/CalendarPickerSheet";
import { ColorPickerSheet } from "./components/ColorPickerSheet";

type CalendarEventEditPageProps = {
  /** 0 表示新建 */
  eventId: number;
  prefillDate: number | null;
  onBack: () => void;
  onSaved: () => void;
  onError: (error: unknown, fallback: string) => void;
};

interface EventDraft {
  title: string;
  calendarId: number | null;
  allDay: boolean;
  startDate: number;
  endDate: number | null;
  startTime: number | null;
  endTime: number | null;
  color: string | null;
  detailContentId: number;
  detailContent: Descendant[];
}

const DEFAULT_START_MINUTE = 9 * 60;
const DEFAULT_END_MINUTE = 10 * 60;

function minuteOf(timestamp: number): number {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
}

export function CalendarEventEditPage({
  eventId,
  prefillDate,
  onBack,
  onSaved,
  onError,
}: CalendarEventEditPageProps) {
  const isDark = useThemeStore(s => s.mode === "dark");
  const editorRef = useRef<EditorRef | null>(null);
  const [pageContainer, setPageContainer] = useState<HTMLDivElement | null>(null);
  const toolbarController = useMobileEditorToolbarController({ editorRef });
  const initialDetail = useRef<string>(JSON.stringify(createEmptyEditorContent()));
  const { data: calendars = [] } = useCalendars();
  const isEdit = eventId > 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);

  const [draft, setDraft] = useState<EventDraft>(() => ({
    title: "",
    calendarId: null,
    allDay: false,
    startDate: prefillDate ? dayStart(prefillDate) : dayStart(Date.now()),
    endDate: null,
    startTime: DEFAULT_START_MINUTE,
    endTime: DEFAULT_END_MINUTE,
    color: null,
    detailContentId: 0,
    detailContent: createEmptyEditorContent(),
  }));
  const [loaded, setLoaded] = useState(!isEdit);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [picker, setPicker] = useState<"none" | "calendar" | "color" | "start" | "end">("none");

  // 编辑态回填：以服务端数据为初始快照
  useEffect(() => {
    if (!isEdit || loaded) {
      return;
    }
    let cancelled = false;
    tauri
      .calendarEventGetById(eventId)
      .then(event => {
        if (cancelled) {
          return;
        }
        const detailContent = structuredClone(normalizeEditorContent(event.detailContent));
        initialDetail.current = JSON.stringify(detailContent);
        setDraft({
          title: event.title,
          calendarId: event.calendarId,
          allDay: event.allDay,
          startDate: dayStart(event.startDate),
          endDate: event.endDate !== null ? dayStart(event.endDate) : null,
          startTime: event.startTime,
          endTime: event.endTime,
          color: event.color,
          detailContentId: event.detailContentId,
          detailContent,
        });
        setLoaded(true);
      })
      .catch(error => {
        if (!cancelled) {
          setLoadFailed(true);
          onError(error, "日程不存在或已删除");
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, isEdit, loaded]);

  // 新建默认日历：第一个非系统日历（对齐桌面 EventDialog 初始化）；
  // 无用户日历时保持 null——兜底系统日历会让保存必然撞写保护，引导先去管理页新建
  useEffect(() => {
    if (isEdit || draft.calendarId !== null || calendars.length === 0) {
      return;
    }
    const fallback = calendars.find(calendar => !calendar.isInSystemGroup && !calendar.archived);
    if (fallback) {
      setDraft(previous => ({ ...previous, calendarId: fallback.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendars, isEdit]);

  const initialSnapshot = useRef<string | null>(null);
  useEffect(() => {
    if (loaded && initialSnapshot.current === null) {
      initialSnapshot.current = JSON.stringify(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, draft]);
  const dirty =
    loaded && initialSnapshot.current !== null && JSON.stringify(draft) !== initialSnapshot.current;

  const requestExit = useCallback(() => {
    if (dirty) {
      setConfirmExit(true);
    } else {
      onBack();
    }
  }, [dirty, onBack]);

  // 系统返回/边缘侧滑：干净直接放行弹栈，有未保存改动则先确认
  useBackHandler(() => {
    if (!dirty) {
      return false;
    }
    setConfirmExit(true);
    return true;
  });

  const selectedCalendar = useMemo(
    () => calendars.find(calendar => calendar.id === draft.calendarId) ?? null,
    [calendars, draft.calendarId]
  );
  const displayColor = eventColorValue(draft.color, selectedCalendar?.color, isDark);

  const setValue = (patch: Partial<EventDraft>) =>
    setDraft(previous => ({ ...previous, ...patch }));

  const handleSave = async () => {
    if (!draft.title.trim() || draft.calendarId === null || saving) {
      return;
    }
    setSaving(true);
    try {
      // 同日 endDate 规范化为 null（桌面数据形态：仅跨天事件有 endDate）
      const endDate =
        draft.endDate !== null && draft.endDate !== draft.startDate ? draft.endDate : null;
      const payload = {
        calendarId: draft.calendarId,
        title: draft.title.trim(),
        detailContentId: draft.detailContentId,
        ...(JSON.stringify(draft.detailContent) !== initialDetail.current
          ? {
              detailContent: draft.detailContent,
              detailContentCount: getContentLength(draft.detailContent),
            }
          : {}),
        startDate: draft.startDate,
        endDate,
        startTime: draft.allDay ? null : draft.startTime,
        endTime: draft.allDay ? null : draft.endTime,
        color: draft.color,
        allDay: draft.allDay,
      };
      if (isEdit) {
        await tauri.calendarEventUpdate({ id: eventId, ...payload });
      } else {
        await tauri.calendarEventCreate(payload);
      }
      invalidateCalendarQueries();
      onSaved();
    } catch (error) {
      const message = typeof error === "string" ? error : "";
      onError(
        error,
        message.includes("SYSTEM_READONLY") ? "系统日历日程不可在移动端编辑" : "保存日程失败"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    try {
      await tauri.calendarEventDelete(eventId);
      invalidateCalendarQueries();
      onSaved();
    } catch (error) {
      onError(error, "删除日程失败");
    }
  };

  const sameDay = draft.endDate === null || draft.endDate === draft.startDate;
  const timeInvalid =
    !draft.allDay &&
    sameDay &&
    draft.startTime !== null &&
    draft.endTime !== null &&
    draft.endTime < draft.startTime;
  const rangeInvalid = draft.endDate !== null && draft.endDate < draft.startDate;
  const error = timeInvalid || rangeInvalid;

  // 编辑态加载完成前只渲染骨架：表单可交互但数据未回填时，加载完成会整体覆盖用户输入；
  // 删除或同步替换导致加载失败时给明确出口。
  if (isEdit && !loaded) {
    return (
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader title="编辑日程" onBack={requestExit} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8">
          {loadFailed ? (
            <>
              <CalendarX2 size={34} className="text-ink-3" aria-hidden />
              <div className="text-ink-1 text-[14px] font-extrabold">日程不存在或已被系统更新</div>
              <div className="text-ink-3 text-center text-[12px] leading-[1.6]">
                请返回日历后重新打开
              </div>
            </>
          ) : (
            <div className="text-ink-3 text-[13px] font-semibold">加载中…</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setPageContainer}
      className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col"
    >
      <PageHeader>
        <button
          type="button"
          onClick={requestExit}
          className="text-ink-3 px-1 py-2 text-[14.5px] font-extrabold"
        >
          取消
        </button>
        <h1 className="text-ink-1 absolute left-1/2 -translate-x-1/2 text-center text-[18px] font-extrabold">
          {isEdit ? "编辑日程" : "新建日程"}
        </h1>
        <div className="ml-auto flex shrink-0 justify-end gap-2">
          {isEdit ? (
            <PageHeaderButton
              icon={<Trash2 size={22} strokeWidth={2.4} />}
              aria-label="删除日程"
              onClick={() => setConfirmDelete(true)}
            />
          ) : (
            <span className="h-10 w-10" />
          )}
        </div>
      </PageHeader>

      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ paddingBottom: "var(--page-bottom-inset)" }}
      >
        <div ref={scrollRef} className="edge-fade-scroll flex-1 overflow-y-auto overscroll-contain">
          <div className="bg-surface shadow-card mx-[18px] mt-3 rounded-[20px] p-[18px]">
            <input
              value={draft.title}
              onChange={event => setValue({ title: event.target.value })}
              placeholder="日程标题…"
              className="text-ink-1 placeholder:text-ink-3 w-full border-none bg-transparent text-[18px] font-extrabold outline-none"
            />
          </div>

          <div className="bg-surface shadow-card mx-[18px] mt-3 rounded-[20px] p-[18px]">
            <div className="text-ink-3 mb-2.5 text-[11.5px] font-extrabold tracking-[1px]">
              时间
            </div>
            <div className="flex items-center gap-3 border-b border-[var(--tau-line-2)] py-[13px]">
              <span className="text-ink-2 w-[62px] flex-none text-[14px] font-bold">全天</span>
              <span className="flex-1" />
              <button
                type="button"
                role="switch"
                aria-checked={draft.allDay}
                aria-label="全天"
                onClick={() => setValue({ allDay: !draft.allDay })}
                className={`relative h-[30px] w-[50px] flex-none rounded-full transition-colors ${
                  draft.allDay ? "bg-[var(--tau-accent)]" : "bg-[var(--ring-track)]"
                }`}
              >
                <span
                  className="bg-surface absolute left-[3px] top-[3px] h-6 w-6 rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-transform"
                  style={{
                    transform: draft.allDay ? "translateX(20px)" : "translateX(0)",
                    transition: "transform 0.25s cubic-bezier(0.34, 1.56, 0.5, 1)",
                  }}
                />
              </button>
            </div>
            <FormRow
              label="开始"
              value={formatDateTimeLine(draft.startDate, draft.startTime, draft.allDay)}
              onClick={() => setPicker("start")}
            />
            <FormRow
              label="结束"
              value={
                draft.endDate !== null && draft.endDate !== draft.startDate
                  ? `${formatMonthDay(draft.endDate)} ${weekdayLabel(draft.endDate)}${
                      draft.allDay
                        ? " · 全天"
                        : draft.endTime !== null
                          ? ` · ${formatTime(draft.endTime)}`
                          : ""
                    }`
                  : formatDateTimeLine(draft.startDate, draft.endTime, draft.allDay)
              }
              onClick={() => setPicker("end")}
              danger={error}
            />
            {error ? (
              <div className="pt-2 text-[11.5px] font-semibold text-[var(--tau-tag-5)]">
                结束时间早于开始时间，保存前请调整
              </div>
            ) : null}
          </div>

          <div className="bg-surface shadow-card mx-[18px] mt-3 rounded-[20px] p-[18px]">
            <div className="text-ink-3 mb-2.5 text-[11.5px] font-extrabold tracking-[1px]">
              归属与外观
            </div>
            <FormRow
              label="日历"
              value={selectedCalendar?.title ?? "选择日历"}
              dotColor={
                selectedCalendar ? eventColorValue(null, selectedCalendar.color, isDark) : undefined
              }
              onClick={() => setPicker("calendar")}
            />
            {calendars.length > 0 &&
            !calendars.some(calendar => !calendar.isInSystemGroup && !calendar.archived) ? (
              <p className="text-ink-3 pt-2 text-[11.5px] leading-[1.6]">
                系统日历不可新建日程：请先到「日历管理」新建一个自己的日历。
              </p>
            ) : null}
            <FormRow
              label="颜色"
              value={draft.color ? `${calendarColorLabel(draft.color)}（自定义）` : "跟随日历"}
              dotColor={draft.color ? displayColor : undefined}
              placeholder={!draft.color}
              onClick={() => setPicker("color")}
            />
          </div>

          <div className="bg-surface shadow-card mx-[18px] mb-1 mt-3 rounded-[20px] p-[18px]">
            <div className="text-ink-3 mb-2.5 text-[11.5px] font-extrabold tracking-[1px]">
              详情
            </div>
            <Editor
              kit={getMobileContentKit()}
              ref={editorRef}
              initValue={draft.detailContent}
              readonly={saving}
              placeHolder="添加日程详情..."
              className="mobile-card-editor-content min-h-[180px] outline-none"
              onFocus={toolbarController.handleEditorFocus}
              onBlur={toolbarController.handleEditorBlur}
              onSelectionChange={toolbarController.syncSelection}
              onChange={detailContent => {
                setValue({ detailContent });
                toolbarController.syncSelection();
              }}
            />
          </div>
          <div className="h-6" />
        </div>

        <div
          className="flex-none px-[18px] pt-3"
          style={{ background: "linear-gradient(to top, var(--tau-bg-page) 62%, transparent)" }}
        >
          <button
            type="button"
            disabled={!draft.title.trim() || draft.calendarId === null || saving || error}
            onClick={handleSave}
            className="shadow-lift text-ink-inverse h-[50px] w-full rounded-[17px] text-[15.5px] font-extrabold disabled:opacity-50"
            style={{ background: "var(--tau-accent)" }}
          >
            {saving ? "保存中…" : isEdit ? "保存修改" : "保存日程"}
          </button>
        </div>
      </div>

      <CalendarPickerSheet
        open={picker === "calendar"}
        calendars={calendars}
        selectedId={draft.calendarId}
        onSelect={calendarId => setValue({ calendarId })}
        onClose={() => setPicker("none")}
      />
      <ColorPickerSheet
        open={picker === "color"}
        selected={draft.color}
        calendarColor={selectedCalendar?.color ?? null}
        onSelect={color => setValue({ color })}
        onClose={() => setPicker("none")}
      />
      <DateTimePickerSheet
        open={picker === "start"}
        title="开始时间"
        value={atLocalTime(draft.startDate, draft.startTime)}
        onConfirm={timestamp => {
          setValue({ startDate: dayStart(timestamp), startTime: minuteOf(timestamp) });
          setPicker("none");
        }}
        onClose={() => setPicker("none")}
      />
      <DateTimePickerSheet
        open={picker === "end"}
        title="结束时间"
        value={atLocalTime(draft.endDate ?? draft.startDate, draft.endTime)}
        onConfirm={timestamp => {
          setValue({ endDate: dayStart(timestamp), endTime: minuteOf(timestamp) });
          setPicker("none");
        }}
        onClose={() => setPicker("none")}
      />

      <MobileEditorBottomToolbar
        controller={toolbarController}
        portalContainer={pageContainer}
        readonly={saving}
      />
      <MobileConfirmDialog
        open={confirmExit}
        title="放弃修改？"
        description="当前改动尚未保存。"
        cancelText="继续编辑"
        confirmText="放弃"
        danger={true}
        onCancel={() => setConfirmExit(false)}
        onConfirm={() => {
          setConfirmExit(false);
          window.setTimeout(onBack, 200);
        }}
      />
      <MobileConfirmDialog
        open={confirmDelete}
        title="删除日程？"
        description="此操作无法撤销。"
        cancelText="取消"
        confirmText="删除"
        danger={true}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function FormRow({
  label,
  value,
  dotColor,
  placeholder = false,
  danger = false,
  onClick,
}: {
  label: string;
  value: string;
  dotColor?: string;
  placeholder?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-[var(--tau-line-2)] py-[13px] text-left last:border-none"
    >
      <span className="text-ink-2 w-[62px] flex-none text-[14px] font-bold">{label}</span>
      <span
        className={`min-w-0 flex-1 text-[14px] font-bold ${
          placeholder
            ? "text-ink-3 font-semibold"
            : danger
              ? "text-[var(--tau-tag-5)]"
              : "text-ink-1"
        }`}
      >
        {dotColor ? (
          <i
            className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-[-1px]"
            style={{ background: dotColor }}
          />
        ) : null}
        {value}
      </span>
      <span className="text-ink-3 text-[13px]">›</span>
    </button>
  );
}
