// 日历管理页（分区列表管理式）：系统分区只读（仅可见性开关）、我的日历、
// 已归档；⋯ 菜单经 ActionSheet，删除二次确认并展示连带事件数；新建/编辑日历用 Sheet。

import { useCalendarI18n, calendarTranslator } from "./i18n";
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
  const { t: translate, locale } = useCalendarI18n();
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
      onError(error, calendarTranslator.t("error.visibility"));
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
      onError(
        error,
        message.includes("SYSTEM_READONLY")
          ? calendarTranslator.t("error.systemDelete")
          : calendarTranslator.t("error.deleteCalendar")
      );
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
        {calendar.eventCount > 0
          ? translate("count.events", {
              count: calendar.eventCount,
              amount: calendar.eventCount.toLocaleString(locale),
            })
          : "—"}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={calendar.visible}
        aria-label={translate("manage.show", { title: calendar.title })}
        onClick={() => toggleVisible(calendar)}
        className={`relative h-[30px] w-[50px] flex-none rounded-full transition-colors ${
          calendar.visible ? "bg-[var(--tau-accent)]" : "bg-[var(--ring-track)]"
        }`}
      >
        <span
          className="bg-surface absolute top-[3px] left-[3px] h-6 w-6 rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-transform"
          style={{
            transform: calendar.visible ? "translateX(20px)" : "translateX(0)",
            transition: "transform 0.25s cubic-bezier(0.34, 1.56, 0.5, 1)",
          }}
        />
      </button>
      {!calendar.isInSystemGroup ? (
        <button
          type="button"
          aria-label={translate("manage.actions", { title: calendar.title })}
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
        title={translate("manage.title")}
        onBack={onBack}
        actions={
          <PageHeaderButton
            variant="brand"
            icon={<Plus size={22} strokeWidth={2.4} />}
            aria-label={translate("manage.new")}
            onClick={() => setFormTarget("new")}
          />
        }
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto overscroll-contain"
        >
          <GroupLabel label={translate("system")} hint={translate("manage.readonly")} />
          <div className="bg-surface shadow-card mx-[18px] rounded-[20px] px-[18px] py-1">
            {systemCalendars.map(calendar => renderRow(calendar))}
          </div>

          <GroupLabel
            label={translate("manage.mine")}
            hint={translate("count.calendars", {
              count: myCalendars.length,
              amount: myCalendars.length.toLocaleString(locale),
            })}
          />
          <div className="bg-surface shadow-card mx-[18px] rounded-[20px] px-[18px] py-1">
            {myCalendars.length > 0 ? (
              myCalendars.map(calendar => renderRow(calendar))
            ) : (
              <div className="text-ink-3 py-4 text-center text-[12.5px] font-semibold">
                {translate("manage.none")}
              </div>
            )}
          </div>

          {archivedCalendars.length > 0 ? (
            <>
              <GroupLabel
                label={translate("manage.archived")}
                hint={translate("count.calendars", {
                  count: archivedCalendars.length,
                  amount: archivedCalendars.length.toLocaleString(locale),
                })}
              />
              <div className="bg-surface shadow-card mx-[18px] rounded-[20px] px-[18px] py-1">
                {archivedCalendars.map(calendar => renderRow(calendar, true))}
              </div>
              <p className="text-ink-3 px-[22px] pt-2.5 text-[11.5px] leading-[1.7]">
                {translate("manage.archiveHint")}
              </p>
            </>
          ) : null}
          <p className="text-ink-3 px-[22px] pt-2.5 text-[11.5px] leading-[1.7]">
            {translate("manage.visibilityHint")}
          </p>
          <div className="h-6" />
        </div>
      </div>

      <ActionSheet
        open={sheetTarget !== null}
        title={
          sheetTarget
            ? translate("manage.summary", {
                title: sheetTarget.title,
                count: sheetTarget.eventCount,
                amount: sheetTarget.eventCount.toLocaleString(locale),
              })
            : undefined
        }
        items={
          sheetTarget
            ? [
                {
                  label: translate("manage.rename"),
                  icon: <Pencil size={16} />,
                  onClick: () => {
                    const target = sheetTarget;
                    setSheetTarget(null);
                    setFormTarget(target);
                  },
                },
                sheetTarget.archived
                  ? {
                      label: translate("manage.unarchive"),
                      icon: <ArchiveRestore size={16} />,
                      onClick: () => {
                        const target = sheetTarget;
                        setSheetTarget(null);
                        tauri
                          .calendarUpdate({ id: target.id, archived: false })
                          .then(() => invalidateCalendarQueries())
                          .catch(error => onError(error, calendarTranslator.t("error.unarchive")));
                      },
                    }
                  : {
                      label: translate("manage.archive"),
                      icon: <Archive size={16} />,
                      onClick: () => {
                        const target = sheetTarget;
                        setSheetTarget(null);
                        tauri
                          .calendarUpdate({ id: target.id, archived: true, visible: false })
                          .then(() => invalidateCalendarQueries())
                          .catch(error => onError(error, calendarTranslator.t("error.archive")));
                      },
                    },
                {
                  label: translate("manage.delete"),
                  icon: <Trash2 size={16} />,
                  danger: true,
                  desc:
                    sheetTarget.eventCount > 0
                      ? translate("manage.deleteDesc", {
                          count: sheetTarget.eventCount,
                          amount: sheetTarget.eventCount.toLocaleString(locale),
                        })
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
        title={translate("manage.deleteTitle", { title: deleteTarget?.title ?? "" })}
        description={
          deleteTarget && deleteTarget.eventCount > 0
            ? translate("manage.deleteConfirm", {
                count: deleteTarget.eventCount,
                amount: deleteTarget.eventCount.toLocaleString(locale),
              })
            : translate("common.irreversible")
        }
        cancelText={translate("common.cancel")}
        confirmText={translate("common.delete")}
        danger={true}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function GroupLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="text-ink-3 flex items-baseline gap-2 px-[22px] pt-4 pb-2">
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
  const { t: translate, locale } = useCalendarI18n();
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
      onError(
        error,
        target
          ? calendarTranslator.t("error.saveCalendar")
          : calendarTranslator.t("error.createCalendar")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      title={target ? translate("manage.edit") : translate("manage.new")}
      onClose={onClose}
    >
      <input
        value={name}
        onChange={event => setName(event.target.value)}
        placeholder={translate("manage.name")}
        className="input-base mt-1 w-full px-3.5 py-3 font-bold"
      />
      <div className="text-ink-3 pt-4 pb-2 text-[11.5px] font-extrabold">
        {translate("color.formHint", { amount: CALENDAR_COLORS.length.toLocaleString(locale) })}
      </div>
      <div className="grid grid-cols-6 gap-3.5 px-0.5">
        {CALENDAR_COLORS.map(entry => {
          const value = calendarColorValue(entry.name, isDark);
          const selected = color === entry.name;
          return (
            <button
              key={entry.name}
              type="button"
              aria-label={translate(entry.message)}
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
          {translate("common.cancel")}
        </button>
        <button
          type="button"
          disabled={!name.trim() || saving}
          onClick={handleSave}
          className="shadow-lift text-ink-inverse h-[46px] flex-1 rounded-[15px] text-[14px] font-extrabold disabled:opacity-50"
          style={{ background: "var(--tau-accent)" }}
        >
          {saving
            ? translate("common.saving")
            : target
              ? translate("common.save")
              : translate("common.create")}
        </button>
      </div>
    </BottomSheet>
  );
}
