import type { RecordingMessageKey } from "./recording.messages";
import { discardConfirmText, formatRecordingTime, formatRecordingSize } from "./recording.format";
import { useRecordingI18n } from "./recording.i18n";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, HardDrive, MapPin, Mic, Pause, Trash2 } from "lucide-react";
import { cn } from "@tau/ui";
import BottomSheet from "../../../components/BottomSheet";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { Z_INDEX } from "../../../router/zIndex";
import {
  cancelEditorRecording,
  discardNeedsConfirm,
  finishEditorRecording,
  toggleRecordingPause,
  useRecordingState,
  type RecordingPauseReason,
  type RecordingState,
} from "./recordingSession";

const PAUSE_KEYS: Record<RecordingPauseReason, RecordingMessageKey> = {
  user: "pause.user",
  interruption: "pause.interruption",
  route: "pause.route",
};

/** AAC 64 kbps ≈ 0.48 MB/分钟 */
const BYTES_PER_MS = 64_000 / 8 / 1000;

function LevelBars(props: {
  levels: readonly number[];
  count: number;
  className?: string;
  paused: boolean;
}) {
  const bars = props.levels.slice(-props.count);
  const padded = [...Array(Math.max(0, props.count - bars.length)).fill(0), ...bars];
  return (
    <span className={cn("flex items-center gap-[2px] overflow-hidden", props.className)}>
      {padded.map((level, index) => (
        <i
          key={index}
          className="min-w-[2px] flex-1 rounded-full bg-current transition-[height] duration-100"
          style={{ height: props.paused ? 3 : `${Math.max(12, level * 100)}%` }}
        />
      ))}
    </span>
  );
}

function StatusDot(props: { paused: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2.5 shrink-0 rounded-full",
        props.paused ? "bg-ink-inverse/55" : "bg-danger animate-pulse"
      )}
    />
  );
}

function RecordingPanel(props: {
  state: RecordingState;
  onCollapse: () => void;
  onDiscard: () => void;
}) {
  const context = useRecordingI18n();
  const { t, locale } = context;
  const { state } = props;
  const paused = state.phase === "paused";
  const saving = state.phase === "saving";
  const used = state.elapsedMs * BYTES_PER_MS;
  const remainingHours =
    state.freeBytes != null ? Math.floor(state.freeBytes / BYTES_PER_MS / 3_600_000) : null;
  return (
    <div className="pb-2">
      <div className="text-center">
        <div className="text-[44px] leading-tight font-light tracking-wide tabular-nums">
          {formatRecordingTime(state.elapsedMs, locale)}
        </div>
        <div className="text-ink-3 mt-0.5 text-[12.5px]">
          {saving
            ? t("status.saving")
            : paused && state.pauseReason
              ? t(PAUSE_KEYS[state.pauseReason])
              : state.documentTitle}
        </div>
      </div>
      <LevelBars
        levels={state.levels}
        count={70}
        paused={paused}
        className="text-danger mx-4 mt-4 mb-1.5 h-[72px]"
      />
      <div className="flex items-start justify-around px-7 pt-3.5">
        <PanelButton label={t("action.discard")} disabled={saving} onPress={props.onDiscard}>
          <Trash2 size={20} />
        </PanelButton>
        <PanelButton
          label={paused ? t("action.continue") : t("action.pause")}
          main
          disabled={saving}
          onPress={() => void toggleRecordingPause()}
        >
          {paused ? <Mic size={26} /> : <Pause size={26} />}
        </PanelButton>
        <PanelButton
          label={state.kind === "replace" ? t("action.finishReplace") : t("action.finishInsert")}
          accent
          disabled={saving}
          onPress={() => {
            props.onCollapse();
            void finishEditorRecording();
          }}
        >
          <Check size={22} />
        </PanelButton>
      </div>
      <div className="bg-surface mx-3.5 mt-9 overflow-hidden rounded-[14px]">
        <InfoRow
          icon={<MapPin size={17} />}
          label={state.kind === "replace" ? t("action.replace") : t("action.insertPosition")}
        >
          {state.kind === "replace"
            ? t("action.originalAudio")
            : t("action.positionHint", { marker: t("marker.position") })}
        </InfoRow>
        <InfoRow icon={<HardDrive size={17} />} label={t("storage.used")}>
          {formatRecordingSize(used, locale)}
          {remainingHours != null
            ? t("storage.remaining", {
                count: remainingHours,
                number: remainingHours.toLocaleString(locale),
              })
            : ""}
        </InfoRow>
      </div>
    </div>
  );
}

function InfoRow(props: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="border-line-2 flex h-12 items-center gap-2.5 border-b px-3.5 text-[14.5px] last:border-b-0">
      <span className="text-ink-2">{props.icon}</span>
      <span className="flex-1">{props.label}</span>
      <span className="text-ink-3 text-[13px]">{props.children}</span>
    </div>
  );
}

function PanelButton(props: {
  label: string;
  main?: boolean;
  accent?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onPress}
      className="flex flex-col items-center gap-1.5 disabled:opacity-40"
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full",
          props.main
            ? "bg-surface text-danger size-[76px] shadow-[inset_0_0_0_3px_var(--tau-danger)]"
            : "size-14",
          props.accent ? "bg-danger text-white" : !props.main && "bg-surface text-ink-1"
        )}
      >
        {props.children}
      </span>
      <span className="text-ink-3 text-[11.5px]">{props.label}</span>
    </button>
  );
}

/**
 * 录音胶囊：录音期间浮在配件栏上方（配件栏隐藏时贴底），键盘与正文照常可用。
 * 点左半边展开录音面板。
 */
export function RecordingCapsule(props: { aboveToolbar: boolean; portalRoot: HTMLElement | null }) {
  const context = useRecordingI18n();
  const { t, locale } = context;
  const state = useRecordingState();
  const [expanded, setExpanded] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  if (!state || !props.portalRoot) return null;
  const paused = state.phase === "paused";
  const saving = state.phase === "saving";
  const starting = state.phase === "starting";

  const requestDiscard = () => {
    if (discardNeedsConfirm(state)) setConfirmingDiscard(true);
    else {
      setExpanded(false);
      void cancelEditorRecording();
    }
  };

  const capsule = (
    <div
      data-recording-capsule=""
      className="bg-ink-1 text-ink-inverse shadow-float fixed inset-x-3 flex h-[52px] items-center gap-2.5 rounded-full pr-1.5 pl-3.5"
      style={{
        zIndex: Z_INDEX.POPOVER,
        bottom: props.aboveToolbar
          ? "calc(var(--mobile-overlay-bottom) + 68px)"
          : "calc(var(--mobile-safe-bottom) + 12px)",
      }}
    >
      <button
        type="button"
        aria-label={t("panel.expand")}
        className="flex min-w-0 flex-1 items-center gap-2.5"
        onClick={() => setExpanded(true)}
      >
        <StatusDot paused={paused || starting} />
        <span className="min-w-11 text-[15px] font-semibold tabular-nums">
          {formatRecordingTime(state.elapsedMs, locale)}
        </span>
        {paused || saving || starting ? (
          <span className="min-w-0 flex-1 truncate text-left text-[13px] opacity-80">
            {saving
              ? t("status.savingDots")
              : starting
                ? t("status.starting")
                : state.pauseReason
                  ? t(PAUSE_KEYS[state.pauseReason])
                  : t("pause.user")}
          </span>
        ) : (
          <LevelBars
            levels={state.levels}
            count={26}
            paused={false}
            className="h-[22px] flex-1 opacity-70"
          />
        )}
      </button>
      <button
        type="button"
        aria-label={paused ? t("action.resumeRecording") : t("action.pauseRecording")}
        disabled={saving || starting}
        onClick={() => void toggleRecordingPause()}
        className={cn(
          "flex size-[38px] shrink-0 items-center justify-center rounded-full disabled:opacity-40",
          paused ? "bg-danger text-white" : "bg-ink-inverse/15"
        )}
      >
        {paused ? <Mic size={18} /> : <Pause size={18} />}
      </button>
      <button
        type="button"
        disabled={saving || starting}
        onClick={() => void finishEditorRecording()}
        className="bg-danger flex h-[38px] shrink-0 items-center gap-1 rounded-full px-3.5 text-[14px] font-semibold text-white disabled:opacity-40"
      >
        <Check size={16} />
        {t("action.finish")}
      </button>
    </div>
  );

  return (
    <>
      {expanded ? null : createPortal(capsule, props.portalRoot)}
      <BottomSheet open={expanded} onClose={() => setExpanded(false)}>
        <div className="flex items-center px-2 pb-1.5">
          <button
            type="button"
            aria-label={t("panel.collapse")}
            className="text-ink-2 flex size-10 items-center justify-center"
            onClick={() => setExpanded(false)}
          >
            <ChevronDown size={20} />
          </button>
          <span className="flex-1 text-center text-[15px] font-semibold">
            {paused ? t("status.paused") : t("status.recording")}
          </span>
          <span className="size-10" />
        </div>
        <RecordingPanel
          state={state}
          onCollapse={() => setExpanded(false)}
          onDiscard={requestDiscard}
        />
      </BottomSheet>
      <MobileConfirmDialog
        open={confirmingDiscard}
        title={t("discard.title")}
        description={discardConfirmText(state, context)}
        confirmText={t("action.discard")}
        danger
        onCancel={() => setConfirmingDiscard(false)}
        onConfirm={() => {
          setConfirmingDiscard(false);
          setExpanded(false);
          void cancelEditorRecording();
        }}
      />
    </>
  );
}
