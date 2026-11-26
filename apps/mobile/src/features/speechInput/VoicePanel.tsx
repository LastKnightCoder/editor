import { formatSpeechElapsed } from "./formatElapsed";
import { useSpeechWorkspaceI18n } from "./workspace.i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  CornerDownLeft,
  Mic,
  MicOff,
  Sparkles,
  Square,
  Undo2,
  X,
} from "lucide-react";
import { cn } from "@tau/ui";
import { useHoldGesture } from "./useHoldGesture";
import type { VoiceDictation } from "./useVoiceDictation";

/** 录音上限，与服务层 120 秒自动停止一致 */
export const DICTATION_LIMIT_MS = 120_000;
/** 剩余该时长起计时变红 */
const WARN_REMAINING_MS = 15_000;
const WAVE_BARS = 22;

function useElapsed(startedAt: number | null, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || startedAt === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running, startedAt]);
  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}

export type VoicePanelProps = {
  dictation: VoiceDictation;
  /** 面板高度（与键盘等高） */
  height: number;
  /** 不显示「换行」（阅读态追加到文末时每段本就另起一段） */
  hideNewline?: boolean;
  /** 面板顶端左侧的附加说明（抽屉形态写明落点） */
  header?: ReactNode;
  className?: string;
};

function SideButton(props: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  hidden?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      disabled={props.disabled || props.hidden}
      aria-hidden={props.hidden || undefined}
      className={cn(
        "flex w-14 flex-col items-center gap-1.5 transition-opacity duration-150 disabled:opacity-35",
        props.hidden && "opacity-0!"
      )}
      onPointerDown={event => event.preventDefault()}
      onMouseDown={event => event.preventDefault()}
      onClick={props.onPress}
    >
      <span className="bg-press text-ink-2 flex h-[46px] w-[46px] items-center justify-center rounded-full">
        {props.icon}
      </span>
      <span className="text-ink-3 text-[11px]">{props.label}</span>
    </button>
  );
}

/** 语音面板：大麦克风轻点开始 / 停止，按住说、上滑 ✕ 取消；两侧撤回这段与换行 */
export function VoicePanel(props: VoicePanelProps) {
  const { t, locale } = useSpeechWorkspaceI18n();
  const { dictation, height, hideNewline = false, header, className } = props;
  const cancelTargetRef = useRef<HTMLDivElement | null>(null);
  const holdModeRef = useRef(false);
  const elapsed = useElapsed(dictation.startedAt, dictation.active);
  const { active, phase, cancelArmed, quiet, result, error, unavailableReason } = dictation;

  const gesture = useHoldGesture(
    {
      onHoldStart: () => {
        if (active) return;
        holdModeRef.current = dictation.begin();
        if (!holdModeRef.current) gesture.abort();
      },
      onRelease: () => {
        if (!holdModeRef.current) return;
        holdModeRef.current = false;
        dictation.finish();
      },
      onCancel: () => {
        if (!holdModeRef.current) return;
        holdModeRef.current = false;
        dictation.cancel();
      },
      onTap: () => {
        // 按下时已开始录音，轻点松手就转为点按模式继续录，再点一下停止
        if (holdModeRef.current) holdModeRef.current = false;
        else if (active) dictation.finish();
      },
    },
    cancelTargetRef,
    { immediate: true }
  );
  const holding = gesture.holding && holdModeRef.current;
  const { setCancelArmed } = dictation;
  useEffect(() => setCancelArmed(gesture.cancelArmed), [gesture.cancelArmed, setCancelArmed]);

  const blocked = unavailableReason ?? null;
  const connecting = phase === "connecting";
  const warn = active && DICTATION_LIMIT_MS - elapsed <= WARN_REMAINING_MS;

  let status: ReactNode;
  if (active) {
    status = (
      <>
        <span
          className={cn(
            "flex items-center gap-1.5 text-[13px] font-semibold tabular-nums",
            warn && !cancelArmed ? "text-danger" : "text-ink-2"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-2 w-2 rounded-full",
              cancelArmed || connecting ? "bg-ink-3" : "bg-accent animate-pulse"
            )}
          />
          {connecting ? t("voice.connecting") : formatSpeechElapsed(elapsed, locale)}
        </span>
        {connecting ? null : (
          <div
            aria-hidden
            className={cn(
              "dictation-wave flex h-[26px] items-center gap-[3px]",
              (cancelArmed || quiet) && "is-still"
            )}
          >
            {Array.from({ length: WAVE_BARS }, (_, index) => (
              <i
                key={index}
                style={{
                  height: `${22 + Math.round(70 * Math.abs(Math.sin(index * 1.7) * Math.cos(index * 0.6)))}%`,
                  animationDelay: `${(index % 7) * -0.13}s`,
                }}
              />
            ))}
          </div>
        )}
      </>
    );
  } else if (blocked || error) {
    status = <span className="text-ink-3 text-[13px]">{blocked ?? error?.message}</span>;
  } else if (result?.kind === "polishing") {
    status = (
      <>
        <span className="bg-accent-soft text-accent-text flex h-[26px] items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold">
          <Sparkles size={13} className="animate-pulse" aria-hidden />
          {t("voice.polishing")}
        </span>
        <button
          type="button"
          className="text-accent-text text-[12.5px] font-semibold"
          onClick={dictation.skipPolish}
        >
          {t("voice.skip")}
        </button>
      </>
    );
  } else if (result?.kind === "refined") {
    status = (
      <>
        <span className="bg-tag-1-soft text-tag-1 flex h-[26px] items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold">
          <Sparkles size={13} aria-hidden />
          {result.showingOriginal ? t("voice.originalShown") : t("voice.refined")}
        </span>
        <button
          type="button"
          className="text-accent-text text-[12.5px] font-semibold"
          onClick={dictation.toggleOriginal}
        >
          {result.showingOriginal ? t("voice.useRefined") : t("voice.useOriginal")}
        </button>
      </>
    );
  } else if (result) {
    status = (
      <>
        <span className="bg-tag-1-soft text-tag-1 flex h-[26px] items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold">
          <Check size={13} strokeWidth={2.6} aria-hidden />
          {result.kind === "failed"
            ? t("voice.refineFailed")
            : t("voice.written", {
                count: result.count,
                number: result.count.toLocaleString(locale),
              })}
        </span>
        {result.kind === "failed" ? (
          <button
            type="button"
            className="text-accent-text text-[12.5px] font-semibold"
            onClick={dictation.retryPolish}
          >
            {t("voice.retry")}
          </button>
        ) : null}
      </>
    );
  } else {
    status = <span className="text-ink-3 text-[13px]">{t("voice.tapStart")}</span>;
  }

  let hint: ReactNode;
  const settingsAction = blocked ? dictation.openSettings : error?.openSettings;
  if (settingsAction) {
    hint = (
      <button
        type="button"
        className="bg-accent-soft text-accent-text flex h-[30px] items-center gap-0.5 rounded-full px-3.5 text-[13px] font-semibold"
        onClick={settingsAction}
      >
        {t("voice.settings")}
        <ChevronRight size={14} aria-hidden />
      </button>
    );
  } else if (holding) {
    hint = cancelArmed ? (
      <span className="text-danger font-semibold">{t("hint.cancel")}</span>
    ) : (
      t("hint.holding")
    );
  } else if (active) {
    hint = quiet ? t("hint.quiet") : t("hint.active");
  } else if (result?.kind === "polishing") {
    hint = t("hint.polishing");
  } else if (result) {
    hint = t("hint.continue");
  } else {
    hint = t("hint.idle");
  }

  const micDisabled = Boolean(blocked);
  return (
    <div
      data-voice-panel=""
      data-kb-optout="true"
      aria-live="polite"
      className={cn(
        "relative flex flex-col items-center pt-3.5 pb-[var(--mobile-safe-bottom)] transition-colors duration-150",
        cancelArmed ? "bg-danger-soft" : "bg-surface",
        className
      )}
      style={{ height }}
    >
      {holding ? (
        <div
          aria-hidden
          className="dictation-scrim pointer-events-none fixed inset-x-0 top-0"
          style={{ bottom: height }}
        />
      ) : null}
      {holding ? (
        <div
          ref={cancelTargetRef}
          aria-label={t("voice.cancelTarget")}
          className={cn(
            "shadow-float absolute left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full transition-all duration-150 ease-tau-out",
            cancelArmed
              ? "bg-danger -top-[88px] h-[70px] w-[70px] text-white"
              : "bg-surface text-ink-2 -top-[78px] h-14 w-14"
          )}
        >
          <X size={cancelArmed ? 26 : 22} strokeWidth={2.2} aria-hidden />
        </div>
      ) : null}
      {header}
      <div className="flex h-[30px] items-center gap-3">{status}</div>
      <div className="flex w-full flex-1 items-center justify-between px-[34px]">
        <SideButton
          label={t("action.undo")}
          icon={<Undo2 size={20} strokeWidth={2.2} />}
          disabled={!result || active}
          hidden={holding}
          onPress={dictation.undoLast}
        />
        <button
          type="button"
          aria-label={active ? t("action.stopInsert") : t("action.start")}
          aria-pressed={active}
          disabled={micDisabled}
          className={cn(
            "voice-mic relative flex h-[84px] w-[84px] items-center justify-center rounded-full transition-transform duration-150 select-none",
            micDisabled
              ? "bg-press text-ink-3"
              : cancelArmed
                ? "bg-ink-3 text-ink-inverse"
                : "bg-accent text-ink-inverse shadow-lift",
            active && !cancelArmed && "is-live",
            holding && "scale-[1.08]"
          )}
          {...gesture.bind}
        >
          {micDisabled ? (
            <MicOff size={32} strokeWidth={2} aria-hidden />
          ) : active && !holding ? (
            <Square size={28} strokeWidth={2.4} fill="currentColor" aria-hidden />
          ) : (
            <Mic size={34} strokeWidth={2} aria-hidden />
          )}
        </button>
        <SideButton
          label={t("action.newline")}
          icon={<CornerDownLeft size={20} strokeWidth={2.2} />}
          disabled={active}
          hidden={holding || hideNewline}
          onPress={dictation.newline}
        />
      </div>
      <div className="text-ink-3 flex h-8 items-center text-[12.5px]">{hint}</div>
    </div>
  );
}
