import { useEffect, useMemo, useState } from "react";
import {
  BellOff,
  BellRing,
  CalendarClock,
  ChevronLeft,
  Clock,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import { useI18n } from "@tau/i18n/react";
import {
  CLOCK_REMINDER_PRESETS,
  clockOffsetToHm,
  formatAbsoluteReminder,
  formatClockOffset,
  hmToClockOffset,
  normalizeClockOffsets,
  normalizeDocumentReminders,
  offsetsDigest,
  reminderMessages,
  remindersDigest,
} from "@tau/shared/reminders";
import type { TaskReminder } from "@tau/shared/task-assistant";
import { BottomSheet } from "../../components/BottomSheet";
import { DateTimePickerSheet } from "../../components/DateTimePickerSheet";
import { mobileI18n } from "../../services/i18n";
import { notifyPermissionIssueText } from "./notification.i18n";
import { useReminderSheetI18n } from "./ReminderSheet.i18n";
import { useNotifyPermission } from "./useNotifyPermission";

export type TaskRemindersSheetProps =
  | {
      open: boolean;
      mode: "clock";
      title?: string;
      subtitle?: string;
      value: readonly number[];
      onCommit: (offsets: number[]) => Promise<boolean> | boolean;
      onClose: () => void;
    }
  | {
      open: boolean;
      mode: "absolute";
      title?: string;
      subtitle?: string;
      value: readonly TaskReminder[];
      onCommit: (reminders: TaskReminder[]) => Promise<boolean> | boolean;
      onClose: () => void;
    };

function shiftMinute(minute: number, delta: number): number {
  return (minute + delta + 60) % 60;
}

function defaultClockOffset(existing: readonly number[]): number {
  const candidates = CLOCK_REMINDER_PRESETS.filter(offset => !existing.includes(offset));
  return candidates[0] ?? hmToClockOffset(9, 0);
}

function defaultAbsoluteTimestamp(): number {
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next.getTime();
}

export function TaskRemindersSheet(props: TaskRemindersSheetProps) {
  const { open, onClose } = props;
  const { t, locale } = useI18n(reminderMessages, mobileI18n);
  const { t: sheetT } = useReminderSheetI18n();
  const permission = useNotifyPermission(open);

  const [explaining, setExplaining] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 时钟模式草稿（周期独立待办 / 周期正文勾选项）
  const clockBaseline = useMemo(
    () => (props.mode === "clock" ? normalizeClockOffsets(props.value) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.mode === "clock" ? offsetsDigest(props.value) : ""]
  );
  const clockBaselineKey = useMemo(() => offsetsDigest(clockBaseline), [clockBaseline]);

  // 绝对时刻模式草稿（普通正文勾选项）
  const absoluteBaseline = useMemo(
    () => (props.mode === "absolute" ? normalizeDocumentReminders(props.value, false) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.mode === "absolute" ? remindersDigest(props.value, false) : ""]
  );
  const absoluteBaselineKey = useMemo(
    () => remindersDigest(absoluteBaseline, false),
    [absoluteBaseline]
  );

  const [clockDraft, setClockDraft] = useState<number[]>(clockBaseline);
  const [absoluteDraft, setAbsoluteDraft] = useState<TaskReminder[]>(absoluteBaseline);

  // 时钟模式内联编辑子视图
  const [clockEditor, setClockEditor] = useState<{
    index: number | null;
    hour: number;
    minute: number;
  } | null>(null);
  const [minuteStep, setMinuteStep] = useState<5 | 1>(5);

  // 绝对时刻模式日期时间选择弹层
  const [absoluteEditor, setAbsoluteEditor] = useState<{
    index: number | null;
    timestamp: number;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setClockEditor(null);
      setAbsoluteEditor(null);
      setExplaining(false);
      return;
    }
    if (props.mode === "clock") {
      setClockDraft(clockBaseline);
      setClockEditor(null);
    } else {
      setAbsoluteDraft(absoluteBaseline);
      setAbsoluteEditor(null);
    }
    // 外部刷新（如冲突回退）或重新打开时同步基线
  }, [open, props.mode, clockBaselineKey, absoluteBaselineKey, clockBaseline, absoluteBaseline]);

  const maybePromptPermission = (wasEmpty: boolean) => {
    if (wasEmpty && permission.state?.notifications === "prompt") {
      setExplaining(true);
    }
  };

  const commitAndClose = async () => {
    if (submitting) return;
    if (props.mode === "clock") {
      const next = normalizeClockOffsets(clockDraft);
      if (offsetsDigest(next) === clockBaselineKey) {
        onClose();
        return;
      }
      setSubmitting(true);
      try {
        const ok = await props.onCommit(next);
        if (ok) onClose();
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const next = normalizeDocumentReminders(absoluteDraft, false);
    if (remindersDigest(next, false) === absoluteBaselineKey) {
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      const ok = await props.onCommit(next);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const timeNumber = useMemo(
    () => new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false }),
    [locale]
  );

  const openAddClock = () => {
    const initial = clockOffsetToHm(defaultClockOffset(clockDraft)) ?? { hour: 9, minute: 0 };
    setMinuteStep(5);
    setClockEditor({ index: null, hour: initial.hour, minute: initial.minute });
  };

  const openEditClock = (index: number) => {
    const hm = clockOffsetToHm(clockDraft[index] ?? hmToClockOffset(9, 0)) ?? {
      hour: 9,
      minute: 0,
    };
    setMinuteStep(hm.minute % 5 === 0 ? 5 : 1);
    setClockEditor({ index, hour: hm.hour, minute: hm.minute });
  };

  const confirmClockEditor = () => {
    if (!clockEditor) return;
    const nextOffset = hmToClockOffset(clockEditor.hour, clockEditor.minute);
    const wasEmpty = clockDraft.length === 0;
    const base =
      clockEditor.index === null
        ? [...clockDraft, nextOffset]
        : clockDraft.map((item, idx) => (idx === clockEditor.index ? nextOffset : item));
    setClockDraft(normalizeClockOffsets(base));
    setClockEditor(null);
    maybePromptPermission(wasEmpty);
  };

  const openAddAbsolute = () => {
    setAbsoluteEditor({ index: null, timestamp: defaultAbsoluteTimestamp() });
  };

  const openEditAbsolute = (index: number) => {
    const target = absoluteDraft[index];
    const ts = target && "at" in target ? Date.parse(target.at) : Number.NaN;
    setAbsoluteEditor({
      index,
      timestamp: Number.isFinite(ts) ? ts : defaultAbsoluteTimestamp(),
    });
  };

  const confirmAbsoluteEditor = (timestamp: number) => {
    if (!absoluteEditor) return;
    const entry: TaskReminder = { at: new Date(timestamp).toISOString() };
    const wasEmpty = absoluteDraft.length === 0;
    const base =
      absoluteEditor.index === null
        ? [...absoluteDraft, entry]
        : absoluteDraft.map((item, idx) => (idx === absoluteEditor.index ? entry : item));
    setAbsoluteDraft(normalizeDocumentReminders(base, false));
    setAbsoluteEditor(null);
    maybePromptPermission(wasEmpty);
  };

  const permissionNotice = (
    <>
      {permission.issue && (
        <p role="alert" className="text-danger mb-2 text-[12.5px]">
          {notifyPermissionIssueText(permission.issue)}
        </p>
      )}
      {permission.state?.notifications === "denied" && (
        <button
          type="button"
          onClick={() => void permission.openSettings().catch(() => undefined)}
          className="bg-tag-4-soft text-tag-4 mb-3 flex w-full items-start gap-2 rounded-[14px] px-3 py-2.5 text-left text-[12.5px] leading-relaxed"
        >
          <BellOff size={16} className="mt-0.5 shrink-0" />
          <span>
            <b className="text-ink-1">{sheetT("permission.disabled")}</b>{" "}
            {sheetT("permission.disabledHint")}{" "}
            <span className="text-accent-text font-semibold">{sheetT("permission.settings")}</span>
          </span>
        </button>
      )}
      {explaining && permission.state?.notifications === "prompt" && (
        <div className="bg-accent-soft mb-3 flex items-start gap-3 rounded-[14px] px-3.5 py-3">
          <BellRing size={18} className="text-accent-text mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-ink-1 text-[14px] font-semibold">{sheetT("permission.title")}</div>
            <div className="text-ink-2 mt-0.5 text-[12.5px] leading-relaxed">
              {sheetT("permission.explanation")}
            </div>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                className="bg-accent text-ink-inverse h-8 rounded-[10px] px-3.5 text-[13px] font-semibold"
                onClick={() => {
                  setExplaining(false);
                  void permission.request().catch(() => undefined);
                }}
              >
                {sheetT("permission.allow")}
              </button>
              <button
                type="button"
                className="text-ink-2 h-8 rounded-[10px] px-2 text-[13px]"
                onClick={() => setExplaining(false)}
              >
                {sheetT("permission.later")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const count = props.mode === "clock" ? clockDraft.length : absoluteDraft.length;
  const sheetTitle = props.title ?? t("ui.title");

  return (
    <>
      <BottomSheet
        open={open}
        title={sheetTitle}
        onClose={() => {
          if (clockEditor) {
            setClockEditor(null);
            return;
          }
          void commitAndClose();
        }}
      >
        <div className="pb-1">
          {props.subtitle ? (
            <div className="text-ink-2 mb-2 truncate text-[13px] font-medium">{props.subtitle}</div>
          ) : null}

          {props.mode === "clock" ? (
            <div className="text-ink-3 mb-2.5 text-[12px]">{t("ui.seriesHint")}</div>
          ) : null}

          {permissionNotice}

          {props.mode === "clock" && clockEditor ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setClockEditor(null)}
                  className="text-ink-2 active:bg-hover inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-medium"
                >
                  <ChevronLeft size={16} />
                  {t("ui.back")}
                </button>
                <span className="text-ink-1 text-[14px] font-semibold">
                  {clockEditor.index === null ? t("ui.addReminder") : t("ui.editReminder")}
                </span>
                <button
                  type="button"
                  onClick={() => setMinuteStep(prev => (prev === 5 ? 1 : 5))}
                  className="border-line-1 bg-surface text-ink-2 active:bg-hover rounded-full border px-2.5 py-1 text-[11.5px] font-medium tabular-nums"
                >
                  {t("ui.stepMinutes", { minutes: minuteStep })}
                </button>
              </div>

              <div className="border-line-1 bg-surface flex items-center justify-center gap-6 rounded-[14px] border py-4">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    aria-label="-1h"
                    onClick={() =>
                      setClockEditor(prev =>
                        prev ? { ...prev, hour: (prev.hour + 23) % 24 } : prev
                      )
                    }
                    className="border-line-1 bg-surface text-ink-2 active:bg-hover grid h-9 w-9 place-items-center rounded-full border"
                  >
                    <Minus size={15} />
                  </button>
                  <span className="text-ink-1 w-11 text-center text-[24px] font-extrabold tabular-nums">
                    {timeNumber.format(clockEditor.hour)}
                  </span>
                  <button
                    type="button"
                    aria-label="+1h"
                    onClick={() =>
                      setClockEditor(prev =>
                        prev ? { ...prev, hour: (prev.hour + 1) % 24 } : prev
                      )
                    }
                    className="border-line-1 bg-surface text-ink-2 active:bg-hover grid h-9 w-9 place-items-center rounded-full border"
                  >
                    <Plus size={15} />
                  </button>
                </div>

                <span className="text-ink-3 text-[20px] font-bold">:</span>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    aria-label={`-${minuteStep}m`}
                    onClick={() =>
                      setClockEditor(prev =>
                        prev ? { ...prev, minute: shiftMinute(prev.minute, -minuteStep) } : prev
                      )
                    }
                    className="border-line-1 bg-surface text-ink-2 active:bg-hover grid h-9 w-9 place-items-center rounded-full border"
                  >
                    <Minus size={15} />
                  </button>
                  <span className="text-ink-1 w-11 text-center text-[24px] font-extrabold tabular-nums">
                    {timeNumber.format(clockEditor.minute)}
                  </span>
                  <button
                    type="button"
                    aria-label={`+${minuteStep}m`}
                    onClick={() =>
                      setClockEditor(prev =>
                        prev ? { ...prev, minute: shiftMinute(prev.minute, minuteStep) } : prev
                      )
                    }
                    className="border-line-1 bg-surface text-ink-2 active:bg-hover grid h-9 w-9 place-items-center rounded-full border"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {CLOCK_REMINDER_PRESETS.map(preset => {
                  const hm = clockOffsetToHm(preset)!;
                  const active = clockEditor.hour === hm.hour && clockEditor.minute === hm.minute;
                  return (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setClockEditor(prev =>
                          prev ? { ...prev, hour: hm.hour, minute: hm.minute } : prev
                        )
                      }
                      className={`rounded-full border py-2 text-[12.5px] font-semibold tabular-nums transition-colors ${
                        active
                          ? "border-accent bg-accent text-ink-inverse"
                          : "border-line-1 bg-surface text-ink-2 active:bg-hover"
                      }`}
                    >
                      {formatClockOffset(preset)}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setClockEditor(null)}
                  className="border-line-1 bg-surface text-ink-2 active:bg-hover h-11 flex-1 rounded-full border text-[14px] font-semibold"
                >
                  {t("ui.cancel")}
                </button>
                <button
                  type="button"
                  onClick={confirmClockEditor}
                  className="bg-accent text-ink-inverse shadow-lift h-11 flex-1 rounded-full text-[14px] font-semibold"
                >
                  {t("ui.confirm")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {count === 0 ? (
                <div className="border-line-1 bg-surface rounded-[14px] border px-4 py-6 text-center">
                  <div className="text-ink-2 text-[13.5px] font-medium">
                    {props.mode === "clock" ? t("ui.emptyClock") : t("ui.emptyAbsolute")}
                  </div>
                  {props.mode === "absolute" ? (
                    <div className="text-ink-3 mt-1 text-[12px]">{t("ui.emptyAbsoluteHint")}</div>
                  ) : null}
                </div>
              ) : (
                <div className="border-line-1 bg-surface overflow-hidden rounded-[14px] border">
                  {props.mode === "clock"
                    ? clockDraft.map((offset, index) => (
                        <div
                          key={offset}
                          className={`flex h-12 items-center gap-2.5 px-3.5 ${
                            index > 0 ? "border-line-2 border-t" : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => openEditClock(index)}
                            className="active:bg-hover flex min-w-0 flex-1 items-center gap-2.5 text-left"
                          >
                            <Clock size={16} className="text-ink-3 shrink-0" />
                            <span className="text-ink-1 text-[15px] font-semibold tabular-nums">
                              {formatClockOffset(offset)}
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={t("ui.delete")}
                            onClick={() =>
                              setClockDraft(prev => prev.filter((_, idx) => idx !== index))
                            }
                            className="text-ink-3 active:text-danger grid h-8 w-8 shrink-0 place-items-center rounded-full"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))
                    : absoluteDraft.map((reminder, index) => {
                        const label =
                          "at" in reminder
                            ? formatAbsoluteReminder(reminder.at, Date.now(), { locale })
                            : formatClockOffset(reminder.offsetMs);
                        const itemKey = "at" in reminder ? reminder.at : String(reminder.offsetMs);
                        return (
                          <div
                            key={itemKey}
                            className={`flex h-12 items-center gap-2.5 px-3.5 ${
                              index > 0 ? "border-line-2 border-t" : ""
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => openEditAbsolute(index)}
                              className="active:bg-hover flex min-w-0 flex-1 items-center gap-2.5 text-left"
                            >
                              <CalendarClock size={16} className="text-ink-3 shrink-0" />
                              <span className="text-ink-1 truncate text-[14.5px] font-semibold tabular-nums">
                                {label}
                              </span>
                            </button>
                            <button
                              type="button"
                              aria-label={t("ui.delete")}
                              onClick={() =>
                                setAbsoluteDraft(prev => prev.filter((_, idx) => idx !== index))
                              }
                              className="text-ink-3 active:text-danger grid h-8 w-8 shrink-0 place-items-center rounded-full"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        );
                      })}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={props.mode === "clock" ? openAddClock : openAddAbsolute}
                    className="border-line-1 bg-surface text-ink-1 active:bg-hover inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-semibold"
                  >
                    <Plus size={15} />
                    {t("ui.add")}
                  </button>
                  {count > 0 ? (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() =>
                        props.mode === "clock" ? setClockDraft([]) : setAbsoluteDraft([])
                      }
                      className="text-ink-3 active:text-danger h-10 rounded-full px-3 text-[13px] font-medium"
                    >
                      {t("ui.clear")}
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void commitAndClose()}
                  className="bg-accent text-ink-inverse shadow-lift h-10 rounded-full px-5 text-[14px] font-semibold disabled:opacity-50"
                >
                  {t("ui.done")}
                </button>
              </div>
            </>
          )}
        </div>
      </BottomSheet>

      {props.mode === "absolute" ? (
        <DateTimePickerSheet
          open={open && absoluteEditor !== null}
          title={absoluteEditor?.index === null ? t("ui.addReminder") : t("ui.editReminder")}
          value={absoluteEditor?.timestamp ?? null}
          defaultHour={9}
          allowFineStep
          stepLabel={minutes => t("ui.stepMinutes", { minutes })}
          onConfirm={confirmAbsoluteEditor}
          onClose={() => setAbsoluteEditor(null)}
        />
      ) : null}
    </>
  );
}
