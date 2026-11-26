import { notifyPermissionIssueText, useNotificationI18n } from "./notification.i18n";
import { useEffect, useState } from "react";
import { AlarmClock, BellOff, ChevronRight, CircleCheck } from "lucide-react";
import { summarizeReminders } from "@tau/shared/reminders";
import { useAppContext } from "../../app/AppContext";
import { ActionSheet } from "../../components/ActionSheet";
import { GroupCard, GroupNote, GroupRow, SwitchButton } from "../settings/components/ui";
import { isNativeNotifyAvailable } from "./native";
import { ReminderSheet } from "./ReminderSheet";
import { resyncReminders } from "./scheduler";
import {
  readReminderSettings,
  SNOOZE_CHOICES,
  withReminderSettings,
  type ReminderSettings,
} from "./settings";
import { useNotifyPermission } from "./useNotifyPermission";

type DefaultKey = "todo" | "event" | "allDay";

const DEFAULT_ROWS: DefaultKey[] = ["todo", "event", "allDay"];

function ValueRow(props: { label: string; value: string; onClick: () => void }) {
  return (
    <GroupRow onClick={props.onClick}>
      <span className="text-ink-1 min-w-0 flex-1 text-[14.5px] font-medium">{props.label}</span>
      <span className="text-ink-3 text-[13px]">{props.value}</span>
      <ChevronRight size={16} className="text-ink-3" aria-hidden />
    </GroupRow>
  );
}

const isAndroid = () => /Android/i.test(navigator.userAgent);

function StatusTile({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <span
      className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl ${
        tone === "ok" ? "bg-tag-1-soft text-tag-1" : "bg-tag-4-soft text-tag-4"
      }`}
    >
      {children}
    </span>
  );
}

/** 设置 › 提醒与通知：系统授权状态、Android 准点提醒授权、已排进系统的提醒数 */
export function NotificationsSection() {
  const { t, locale } = useNotificationI18n();
  const { state, issue, request, openSettings, refresh } = useNotifyPermission();
  const [pending, setPending] = useState<number | null>(null);
  const app = useAppContext();
  const settings = readReminderSettings(app.syncSettings.safeSetting);
  const [editing, setEditing] = useState<DefaultKey | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const save = (patch: Partial<ReminderSettings>) =>
    app.syncSettings.updateSetting(prev => withReminderSettings(prev, patch), { persist: true });

  useEffect(() => {
    // 进页面先重排一次，数字反映当前数据而不是上次排期
    void resyncReminders().then(next => setPending(next?.pending ?? null));
  }, []);

  if (!isNativeNotifyAvailable()) {
    return <GroupNote>{t("nativeOnly")}</GroupNote>;
  }

  const notifications = state?.notifications;
  const granted = notifications === "granted";
  return (
    <div className="page-enter space-y-1">
      {issue && (
        <p role="alert" className="text-danger text-tau-sm px-[15px] py-2">
          {notifyPermissionIssueText(issue)}
        </p>
      )}
      <GroupCard>
        <GroupRow
          onClick={
            granted
              ? undefined
              : () =>
                  void (notifications === "prompt" ? request() : openSettings())
                    .then(() => refresh())
                    .catch(() => undefined)
          }
        >
          <StatusTile tone={granted ? "ok" : "warn"}>
            {granted ? <CircleCheck size={17} /> : <BellOff size={17} />}
          </StatusTile>
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 block text-[14.5px] font-medium">
              {t("notifications.title")}
            </span>
            <span className="text-ink-3 block text-[11.5px]">
              {granted
                ? t("notifications.on")
                : notifications === "prompt"
                  ? t("notifications.prompt")
                  : t("notifications.off")}
            </span>
          </span>
          {!granted && (
            <span className="text-accent-text text-[13.5px] font-semibold">
              {notifications === "prompt" ? t("notifications.enable") : t("notifications.settings")}
            </span>
          )}
        </GroupRow>
        {isAndroid() && (
          <GroupRow
            onClick={
              state?.exactAlarm === "granted"
                ? undefined
                : () =>
                    void openSettings("exactAlarm")
                      .then(() => refresh())
                      .catch(() => undefined)
            }
          >
            <StatusTile tone={state?.exactAlarm === "granted" ? "ok" : "warn"}>
              <AlarmClock size={17} />
            </StatusTile>
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 block text-[14.5px] font-medium">{t("exact.title")}</span>
              <span className="text-ink-3 block text-[11.5px]">
                {state?.exactAlarm === "granted" ? t("exact.allowed") : t("exact.denied")}
              </span>
            </span>
            {state?.exactAlarm !== "granted" && (
              <span className="text-accent-text text-[13.5px] font-semibold">
                {t("exact.allow")}
              </span>
            )}
          </GroupRow>
        )}
      </GroupCard>
      <GroupNote>
        {pending != null ? t("pending", { count: pending }) : ""}
        {isAndroid() ? t("batteryHint") : ""}
      </GroupNote>

      <div className="text-ink-3 px-[15px] pt-4 pb-1.5 text-[12px]">{t("defaults.title")}</div>
      <GroupCard>
        {DEFAULT_ROWS.map(key => (
          <ValueRow
            key={key}
            label={t(`defaults.${key}`)}
            value={summarizeReminders(settings[key], key === "allDay", { locale })}
            onClick={() => setEditing(key)}
          />
        ))}
      </GroupCard>
      <GroupNote>{t("defaults.hint")}</GroupNote>

      <div className="text-ink-3 px-[15px] pt-4 pb-1.5 text-[12px]">{t("other")}</div>
      <GroupCard>
        <GroupRow>
          <span className="text-ink-1 min-w-0 flex-1 text-[14.5px] font-medium">
            {t("foreground")}
          </span>
          <SwitchButton
            checked={settings.foregroundBanner}
            onChange={() => save({ foregroundBanner: !settings.foregroundBanner })}
          />
        </GroupRow>
        <ValueRow
          label={t("snooze.title")}
          value={t("minutes", { count: settings.snoozeMinutes })}
          onClick={() => setSnoozeOpen(true)}
        />
      </GroupCard>
      <GroupNote>{t("foregroundHint")}</GroupNote>

      <ReminderSheet
        open={editing !== null}
        value={editing ? settings[editing] : []}
        anchor={null}
        allDay={editing === "allDay"}
        onChange={offsets => editing && save({ [editing]: offsets })}
        onClose={() => setEditing(null)}
      />
      <ActionSheet
        open={snoozeOpen}
        title={t("snooze.title")}
        items={SNOOZE_CHOICES.map(minutes => ({
          key: `snooze:${minutes}`,
          label: t("minutes", { count: minutes }),
          selected: settings.snoozeMinutes === minutes,
          onClick: () => save({ snoozeMinutes: minutes }),
        }))}
        onClose={() => setSnoozeOpen(false)}
      />
    </div>
  );
}
