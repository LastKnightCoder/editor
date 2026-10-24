// 日历管理页（定稿 A 分区列表管理式）：系统分区只读（仅可见性开关）、我的日历、
// 已归档；⋯ 菜单经 ActionSheet，删除二次确认并展示连带事件数；新建/编辑日历用 Sheet。

import { useRef, useState } from "react";
import { Archive, ArchiveRestore, Check, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import { ActionSheet } from "../../components/ActionSheet";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { BottomSheet } from "../../components/BottomSheet";
import { useThemeStore } from "@tau/themes/react";
import { useEdgeFade } from "../../hooks/useScrollState";
import { CALENDAR_COLORS, calendarColorValue } from "./constants";
import { useCalendars, invalidateCalendarQueries } from "./queries";
import * as tauri from "../../services/tauri";
import type { Calendar } from "./types";

type CalendarManagePageProps = {
  onBack: () => void;
  onError: (error: unknown, fallback: string) => void;
};

export function CalendarManagePage({ onBack, onError }: CalendarManagePageProps) {
  const isDark = useThemeStore(s => s.mode === "dark");
  const { data: calendars = [] } = useCalendars();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  const [sheetTarget, setSheetTarget] = useState<Calendar | null>(null);
  const [formTarget, setFormTarget] = useState<Calendar | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Calendar | null>(null);

  const systemCalendars = calendars.filter(calendar => calendar.isInSystemGroup);
  const myCalendars = calendars.filter(calendar => !calendar.isInSystemGroup && !calendar.archived);
  const archivedCalendars = calendars.filter(calendar => calendar.archived);

  const toggleVisible = async (calendar: Calendar) => {
    try {
      await tauri.calendarUpdate({ id: calendar.id, visible: !calendar.visible });
      invalidateCalendarQueries();
    } catch (error) {
      onError(error, "切换可见性失败");
    }
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) {
      return;
    }
    try {
      await tauri.calendarDelete(target.id);
      invalidateCalendarQueries();
    } catch (error) {
      const message = typeof error === "string" ? error : "";
      onError(error, message.includes("SYSTEM_READONLY") ? "系统日历不可删除" : "删除日历失败");
    }
  };

  const renderRow = (calendar: Calendar, archived = false) => (
    <div
      key={calendar.id}
      className={`flex items-center gap-3 border-b border-[var(--tau-line-2)] py-3 last:border-none ${
        archived ? "opacity-70" : ""
      }`}
    >
      <i
        className="h-[11px] w-[11px] flex-none rounded-full"
        style={{ background: calendarColorValue(calendar.color, isDark) }}
      />
      <span className="text-ink-1 min-w-0 flex-1 truncate text-[14.5px] font-bold">
        {calendar.title}
      </span>
      <span className="text-ink-3 flex-none text-[11.5px] font-bold tabular-nums">
        {calendar.eventCount > 0 ? `${calendar.eventCount} 件` : "—"}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={calendar.visible}
        aria-label={`显示${calendar.title}`}
        onClick={() => toggleVisible(calendar)}
        className={`relative h-[30px] w-[50px] flex-none rounded-full transition-colors ${
          calendar.visible ? "bg-[var(--tau-accent)]" : "bg-[var(--ring-track)]"
        }`}
      >
        <span
          className="bg-surface absolute left-[3px] top-[3px] h-6 w-6 rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-transform"
          style={{
            transform: calendar.visible ? "translateX(20px)" : "translateX(0)",
            transition: "transform 0.25s cubic-bezier(0.34, 1.56, 0.5, 1)",
          }}
        />
      </button>
      {!calendar.isInSystemGroup ? (
        <button
          type="button"
          aria-label={`${calendar.title} 操作`}
          onClick={() => setSheetTarget(calendar)}
          className="text-ink-3 grid h-9 w-9 flex-none place-items-center rounded-full"
        >
          <MoreHorizontal size={20} strokeWidth={2.4} />
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader
        title="日历管理"
        onBack={onBack}
        actions={
          <PageHeaderButton
            variant="brand"
            icon={<Plus size={22} strokeWidth={2.4} />}
            aria-label="新建日历"
            onClick={() => setFormTarget("new")}
          />
        }
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto overscroll-contain"
        >
          <GroupLabel label="系统" hint="只读 · 仅可切换显示" />
          <div className="bg-surface shadow-card mx-[18px] rounded-[20px] px-[18px] py-1">
            {systemCalendars.map(calendar => renderRow(calendar))}
          </div>

          <GroupLabel label="我的日历" hint={`${myCalendars.length} 个`} />
          <div className="bg-surface shadow-card mx-[18px] rounded-[20px] px-[18px] py-1">
            {myCalendars.length > 0 ? (
              myCalendars.map(calendar => renderRow(calendar))
            ) : (
              <div className="text-ink-3 py-4 text-center text-[12.5px] font-semibold">
                还没有自建日历，点右上 ＋ 新建
              </div>
            )}
          </div>

          {archivedCalendars.length > 0 ? (
            <>
              <GroupLabel label="已归档" hint={`${archivedCalendars.length} 个`} />
              <div className="bg-surface shadow-card mx-[18px] rounded-[20px] px-[18px] py-1">
                {archivedCalendars.map(calendar => renderRow(calendar, true))}
              </div>
              <p className="text-ink-3 px-[22px] pt-2.5 text-[11.5px] leading-[1.7]">
                归档日历不参与主页展示与查询，事件保留；取消归档即可恢复。
              </p>
            </>
          ) : null}
          <p className="text-ink-3 px-[22px] pt-2.5 text-[11.5px] leading-[1.7]">
            可见性开关作用于首页「今日日程」卡与默认勾选；日历主页顶部的过滤条单独记忆，互不影响。
          </p>
          <div className="h-6" />
        </div>
      </div>

      <ActionSheet
        open={sheetTarget !== null}
        title={
          sheetTarget ? `日历「${sheetTarget.title}」· ${sheetTarget.eventCount} 件日程` : undefined
        }
        items={
          sheetTarget
            ? [
                {
                  label: "编辑名称 / 颜色",
                  icon: <Pencil size={16} />,
                  onClick: () => {
                    const target = sheetTarget;
                    setSheetTarget(null);
                    setFormTarget(target);
                  },
                },
                sheetTarget.archived
                  ? {
                      label: "取消归档",
                      icon: <ArchiveRestore size={16} />,
                      onClick: () => {
                        const target = sheetTarget;
                        setSheetTarget(null);
                        tauri
                          .calendarUpdate({ id: target.id, archived: false })
                          .then(() => invalidateCalendarQueries())
                          .catch(error => onError(error, "取消归档失败"));
                      },
                    }
                  : {
                      label: "归档此日历",
                      icon: <Archive size={16} />,
                      onClick: () => {
                        const target = sheetTarget;
                        setSheetTarget(null);
                        tauri
                          .calendarUpdate({ id: target.id, archived: true, visible: false })
                          .then(() => invalidateCalendarQueries())
                          .catch(error => onError(error, "归档失败"));
                      },
                    },
                {
                  label: `删除日历`,
                  icon: <Trash2 size={16} />,
                  danger: true,
                  desc:
                    sheetTarget.eventCount > 0
                      ? `将同时删除 ${sheetTarget.eventCount} 件日程`
                      : undefined,
                  onClick: () => {
                    const target = sheetTarget;
                    setSheetTarget(null);
                    setDeleteTarget(target);
                  },
                },
              ]
            : []
        }
        onClose={() => setSheetTarget(null)}
      />

      <CalendarFormSheet
        open={formTarget !== null}
        target={formTarget === "new" ? null : formTarget}
        onClose={() => setFormTarget(null)}
        onSaved={invalidateCalendarQueries}
        onError={onError}
      />

      <MobileConfirmDialog
        open={deleteTarget !== null}
        title={`删除日历「${deleteTarget?.title ?? ""}」？`}
        description={
          deleteTarget && deleteTarget.eventCount > 0
            ? `将同时删除该日历下的 ${deleteTarget.eventCount} 件日程，此操作无法撤销。`
            : "此操作无法撤销。"
        }
        cancelText="取消"
        confirmText="删除"
        danger={true}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function GroupLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="text-ink-3 flex items-baseline gap-2 px-[22px] pb-2 pt-4">
      <span className="text-[12px] font-extrabold tracking-[1px]">{label}</span>
      {hint ? <span className="text-[11px] font-semibold opacity-80">{hint}</span> : null}
    </div>
  );
}

function CalendarFormSheet({
  open,
  target,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  target: Calendar | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (error: unknown, fallback: string) => void;
}) {
  const isDark = useThemeStore(s => s.mode === "dark");
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("orange");
  const [wasOpen, setWasOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // 上升沿初始化草稿：防 refetch 重置输入（对齐 DeckFormSheet 做法）
  if (open && !wasOpen) {
    setName(target?.title ?? "");
    setColor(target?.color ?? "orange");
    setSaving(false);
  }
  if (open !== wasOpen) {
    setWasOpen(open);
  }

  const handleSave = async () => {
    const title = name.trim();
    if (!title || saving) {
      return;
    }
    setSaving(true);
    try {
      if (target) {
        await tauri.calendarUpdate({ id: target.id, title, color });
      } else {
        await tauri.calendarCreate({ title, color });
      }
      onSaved();
      onClose();
    } catch (error) {
      onError(error, target ? "保存日历失败" : "新建日历失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} title={target ? "编辑日历" : "新建日历"} onClose={onClose}>
      <input
        value={name}
        onChange={event => setName(event.target.value)}
        placeholder="日历名称，如：工作、生活…"
        className="bg-page text-ink-1 placeholder:text-ink-3 mt-1 w-full rounded-[13px] border-none px-3.5 py-3 text-[14.5px] font-bold outline-none"
      />
      <div className="text-ink-3 pb-2 pt-4 text-[11.5px] font-extrabold">
        颜色 · 与桌面端同一套 17 色
      </div>
      <div className="grid grid-cols-6 gap-3.5 px-0.5">
        {CALENDAR_COLORS.map(entry => {
          const value = calendarColorValue(entry.name, isDark);
          const selected = color === entry.name;
          return (
            <button
              key={entry.name}
              type="button"
              aria-label={entry.label}
              aria-pressed={selected}
              onClick={() => setColor(entry.name)}
              // 与日程颜色面板同一套选中态：品牌色 ring + 面板底色间隙
              // （原 ink 描边在各主题下都是近黑/近白的中性色，看着像跑错了主题）
              className={`grid aspect-square place-items-center rounded-full text-[13px] font-extrabold text-white ${
                selected ? "ring-accent ring-offset-surface ring-2 ring-offset-2" : ""
              }`}
              style={{ background: value }}
            >
              {selected ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2.5 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="bg-page text-ink-2 h-[46px] flex-1 rounded-[15px] text-[14px] font-extrabold"
        >
          取消
        </button>
        <button
          type="button"
          disabled={!name.trim() || saving}
          onClick={handleSave}
          className="shadow-lift text-ink-inverse h-[46px] flex-1 rounded-[15px] text-[14px] font-extrabold disabled:opacity-50"
          style={{ background: "var(--tau-accent)" }}
        >
          {saving ? "保存中…" : target ? "保存" : "创建"}
        </button>
      </div>
    </BottomSheet>
  );
}
