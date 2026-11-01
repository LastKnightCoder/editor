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

const DEFAULT_ROWS: Array<{ key: DefaultKey; label: string }> = [
  { key: "todo", label: "新建截止任务" },
  { key: "event", label: "新建日程" },
  { key: "allDay", label: "新建全天日程" },
];

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
  const { state, request, openSettings, refresh } = useNotifyPermission();
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
    return <GroupNote>系统通知只在手机 App 中可用。</GroupNote>;
  }

  const notifications = state?.notifications;
  const granted = notifications === "granted";
  return (
    <div className="page-enter space-y-1">
      <GroupCard>
        <GroupRow
          onClick={
            granted
              ? undefined
              : () =>
                  void (notifications === "prompt" ? request() : openSettings()).then(() =>
                    refresh()
                  )
          }
        >
          <StatusTile tone={granted ? "ok" : "warn"}>
            {granted ? <CircleCheck size={17} /> : <BellOff size={17} />}
          </StatusTile>
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 block text-[14.5px] font-medium">系统通知</span>
            <span className="text-ink-3 block text-[11.5px]">
              {granted ? "已开启" : notifications === "prompt" ? "尚未开启" : "已关闭，提醒不会响"}
            </span>
          </span>
          {!granted && (
            <span className="text-accent-text text-[13.5px] font-semibold">
              {notifications === "prompt" ? "开启" : "去设置"}
            </span>
          )}
        </GroupRow>
        {isAndroid() && (
          <GroupRow
            onClick={
              state?.exactAlarm === "granted"
                ? undefined
                : () => void openSettings("exactAlarm").then(() => refresh())
            }
          >
            <StatusTile tone={state?.exactAlarm === "granted" ? "ok" : "warn"}>
              <AlarmClock size={17} />
            </StatusTile>
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 block text-[14.5px] font-medium">准点提醒</span>
              <span className="text-ink-3 block text-[11.5px]">
                {state?.exactAlarm === "granted" ? "已允许" : "未允许，可能延后几分钟"}
              </span>
            </span>
            {state?.exactAlarm !== "granted" && (
              <span className="text-accent-text text-[13.5px] font-semibold">去允许</span>
            )}
          </GroupRow>
        )}
      </GroupCard>
      <GroupNote>
        {pending != null ? `接下来 14 天有 ${pending} 个提醒已排进系统。` : ""}
        {isAndroid() ? "部分手机的省电策略会拦截提醒，可在系统设置里允许 Tau 后台运行。" : ""}
      </GroupNote>

      <div className="text-ink-3 px-[15px] pt-4 pb-1.5 text-[12px]">默认提醒</div>
      <GroupCard>
        {DEFAULT_ROWS.map(row => (
          <ValueRow
            key={row.key}
            label={row.label}
            value={summarizeReminders(settings[row.key], row.key === "allDay")}
            onClick={() => setEditing(row.key)}
          />
        ))}
      </GroupCard>
      <GroupNote>只影响新建的任务和日程，已有的不改。</GroupNote>

      <div className="text-ink-3 px-[15px] pt-4 pb-1.5 text-[12px]">其他</div>
      <GroupCard>
        <GroupRow>
          <span className="text-ink-1 min-w-0 flex-1 text-[14.5px] font-medium">
            App 在前台时显示横幅
          </span>
          <SwitchButton
            checked={settings.foregroundBanner}
            onChange={() => save({ foregroundBanner: !settings.foregroundBanner })}
          />
        </GroupRow>
        <ValueRow
          label="稍后提醒间隔"
          value={`${settings.snoozeMinutes} 分钟`}
          onClick={() => setSnoozeOpen(true)}
        />
      </GroupCard>
      <GroupNote>
        关闭横幅后，App 在前台时也弹系统通知。提醒在待办详情或日程编辑里设置，最多 3
        个；桌面端同时提醒。
      </GroupNote>

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
        title="稍后提醒间隔"
        items={SNOOZE_CHOICES.map(minutes => ({
          label: `${minutes} 分钟`,
          selected: settings.snoozeMinutes === minutes,
          onClick: () => save({ snoozeMinutes: minutes }),
        }))}
        onClose={() => setSnoozeOpen(false)}
      />
    </div>
  );
}
