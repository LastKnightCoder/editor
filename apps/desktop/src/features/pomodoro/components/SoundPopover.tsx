/**
 * 背景音面板（Popover）：8 种环境音 + 无，选中即切换（主进程广播，背景音窗口播放）；
 * 音量拖动时本地即时跟手，松手才落到主进程，避免拖动过程连发请求。
 */

import {
  useEffect,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactElement,
} from "react";
import { Music, Volume2 } from "lucide-react";
import { Popover, cn } from "@tau/ui";
import { BACKGROUND_SOUND_OPTIONS } from "@/constants/backgroundSounds";
import { pomodoroActions, usePomodoroTimer } from "../timerStore";

export function SoundPopover({
  trigger,
  placement = "bottom-end",
}: {
  trigger: ReactElement;
  placement?: ComponentProps<typeof Popover>["placement"];
}) {
  const sound = usePomodoroTimer(s => s.sound);
  const volume = usePomodoroTimer(s => s.volume);
  const [draftVolume, setDraftVolume] = useState(volume);
  useEffect(() => setDraftVolume(volume), [volume]);

  return (
    <Popover trigger={trigger} placement={placement} arrow={false} className="w-[300px]">
      <Popover.Header icon={<Music className="size-[15px]" strokeWidth={1.75} />}>
        背景音
      </Popover.Header>
      <Popover.Body>
        <div className="grid grid-cols-3 gap-1.5">
          {BACKGROUND_SOUND_OPTIONS.map(option => {
            const on = option.value === sound;
            return (
              <button
                key={option.value ?? "none"}
                type="button"
                aria-pressed={on}
                onClick={() => void pomodoroActions.setSound(option.value)}
                className={cn(
                  "text-tau-meta h-8 rounded-[9px] transition-[background,color,border-color] duration-150",
                  on
                    ? "bg-accent-soft text-accent-text font-medium"
                    : "border-line-1 text-ink-2 hover:border-ink-3 hover:text-ink-1 border"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <label
          className={cn(
            "text-ink-2 text-tau-sm mt-3.5 flex items-center gap-2.5",
            !sound && "pointer-events-none opacity-45"
          )}
        >
          <Volume2 className="size-[15px] shrink-0" strokeWidth={1.75} aria-hidden />
          <input
            type="range"
            min={0}
            max={100}
            value={draftVolume}
            aria-label="音量"
            onChange={e => setDraftVolume(Number(e.target.value))}
            onPointerUp={() => void pomodoroActions.setVolume(draftVolume)}
            onKeyUp={() => void pomodoroActions.setVolume(draftVolume)}
            style={{ "--v": `${draftVolume}%` } as CSSProperties}
            className={cn(
              "h-1 flex-1 cursor-pointer appearance-none rounded-full",
              "bg-[linear-gradient(to_right,var(--tau-accent)_0_var(--v),var(--tau-bg-track)_var(--v)_100%)]",
              // 圆钮：accent 实心 + 一圈 surface 描边——明暗主题下都与弹层底色拉开（surface 实心在深色下会隐没）
              "[&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none",
              "[&::-webkit-slider-thumb]:shadow-lift [&::-webkit-slider-thumb]:ring-surface [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:ring-2"
            )}
          />
          <span className="w-9 text-right tabular-nums">{draftVolume}%</span>
        </label>
      </Popover.Body>
    </Popover>
  );
}
