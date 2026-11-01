import { useEffect, useState } from "react";
import { BellOff, BellRing, Check } from "lucide-react";
import {
  MAX_REMINDERS,
  normalizeReminders,
  reminderLabel,
  reminderPresets,
} from "@tau/shared/reminders";
import { BottomSheet } from "../../components/BottomSheet";
import { useNotifyPermission } from "./useNotifyPermission";

const pad = (value: number) => String(value).padStart(2, "0");

function clockOf(time: number) {
  const date = new Date(time);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return sameDay ? hm : `${date.getMonth() + 1}/${date.getDate()} ${hm}`;
}

type ReminderSheetProps = {
  open: boolean;
  value: readonly number[];
  /** 截止时间 / 开始时间（全天为当天零点）；用于在每行旁写出实际提醒时刻 */
  anchor: number | null;
  allDay?: boolean;
  onChange: (offsets: number[]) => void;
  onClose: () => void;
};

/**
 * 提醒多选面板（最多 MAX_REMINDERS 个）：勾选即时生效到草稿，点「完成」才提交；
 * 首次设置提醒时先说明再请求系统通知权限，被拒后在面板顶部提示去开启。
 */
export function ReminderSheet({
  open,
  value,
  anchor,
  allDay = false,
  onChange,
  onClose,
}: ReminderSheetProps) {
  const [draft, setDraft] = useState<number[]>([...value]);
  const permission = useNotifyPermission(open);
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    if (open) setDraft([...value]);
    // 只在打开时重置草稿
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const presets = reminderPresets(allDay);
  const others = draft
    .filter(offset => !presets.some(preset => preset.offset === offset))
    .map(offset => ({ offset, label: reminderLabel(offset, allDay) }));
  const options = [...presets, ...others];
  const full = draft.length >= MAX_REMINDERS;

  const toggle = (offset: number) => {
    const has = draft.includes(offset);
    if (!has && full) return;
    const next = normalizeReminders(
      has ? draft.filter(item => item !== offset) : [...draft, offset]
    );
    // 第一次添加提醒且系统还没问过权限：先说明再请求
    if (!has && draft.length === 0 && permission.state?.notifications === "prompt") {
      setExplaining(true);
    }
    setDraft(next);
  };

  const commit = () => {
    onChange(draft);
    onClose();
  };

  return (
    <BottomSheet open={open} title="提醒" onClose={commit}>
      <div className="px-4 pb-2">
        {permission.state?.notifications === "denied" && (
          <button
            type="button"
            onClick={() => void permission.openSettings()}
            className="bg-tag-4-soft text-tag-4 mb-3 flex w-full items-start gap-2 rounded-[14px] px-3 py-2.5 text-left text-[12.5px] leading-relaxed"
          >
            <BellOff size={16} className="mt-0.5 shrink-0" />
            <span>
              <b className="text-ink-1">通知已关闭</b>，提醒会保存但不会响。
              <span className="text-accent-text font-semibold">去开启</span>
            </span>
          </button>
        )}
        {explaining && permission.state?.notifications === "prompt" && (
          <div className="bg-accent-soft mb-3 flex items-start gap-3 rounded-[14px] px-3.5 py-3">
            <BellRing size={18} className="text-accent-text mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-ink-1 text-[14px] font-semibold">到点提醒你</div>
              <div className="text-ink-2 mt-0.5 text-[12.5px] leading-relaxed">
                需要通知权限，才能在截止前、日程开始前提醒你。关掉 App 也会准时响。
              </div>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  className="bg-accent text-ink-inverse h-8 rounded-[10px] px-3.5 text-[13px] font-semibold"
                  onClick={() => {
                    setExplaining(false);
                    void permission.request();
                  }}
                >
                  开启通知
                </button>
                <button
                  type="button"
                  className="text-ink-2 h-8 rounded-[10px] px-2 text-[13px]"
                  onClick={() => setExplaining(false)}
                >
                  以后再说
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-page overflow-hidden rounded-[16px]">
          {options.map((option, index) => {
            const checked = draft.includes(option.offset);
            const disabled = !checked && full;
            return (
              <button
                key={option.offset}
                type="button"
                disabled={disabled}
                onClick={() => toggle(option.offset)}
                className={`flex h-12 w-full items-center gap-2.5 px-3.5 text-left text-[15px] ${
                  index > 0 ? "border-line-2 border-t" : ""
                } ${disabled ? "text-ink-3" : "text-ink-1"}`}
              >
                <span className="flex-1">{option.label}</span>
                {checked && anchor != null && (
                  <span className="text-ink-3 text-[12px] tabular-nums">
                    {clockOf(anchor - option.offset)}
                  </span>
                )}
                <span
                  className={`grid h-5 w-5 place-items-center rounded-[6px] border-[1.5px] ${
                    checked ? "border-accent bg-accent text-ink-inverse" : "border-line-1"
                  }`}
                >
                  {checked && <Check size={13} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="text-ink-3 flex items-center justify-between px-1 pt-2.5 text-[11.5px]">
          <span>
            {draft.length ? `已选 ${draft.length} 个，最多 ${MAX_REMINDERS} 个` : "不提醒"}
          </span>
          <button
            type="button"
            onClick={commit}
            className="text-accent-text text-[14px] font-semibold"
          >
            完成
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
