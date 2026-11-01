import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, HardDrive, MapPin, Mic, Pause, Trash2 } from "lucide-react";
import { cn } from "@tau/ui";
import BottomSheet from "../../../components/BottomSheet";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { Z_INDEX } from "../../../router/zIndex";
import {
  cancelEditorRecording,
  discardConfirmText,
  discardNeedsConfirm,
  finishEditorRecording,
  formatRecordingTime,
  toggleRecordingPause,
  useRecordingState,
  type RecordingPauseReason,
  type RecordingState,
} from "./recordingSession";

const PAUSE_LABELS: Record<RecordingPauseReason, string> = {
  user: "已暂停",
  interruption: "来电或其他应用占用，已自动暂停",
  route: "耳机已断开，已自动暂停",
};

/** AAC 64 kbps ≈ 0.48 MB/分钟 */
const BYTES_PER_MS = 64_000 / 8 / 1000;

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

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
          {formatRecordingTime(state.elapsedMs)}
        </div>
        <div className="text-ink-3 mt-0.5 text-[12.5px]">
          {saving
            ? "正在保存"
            : paused && state.pauseReason
              ? PAUSE_LABELS[state.pauseReason]
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
        <PanelButton label="放弃" disabled={saving} onPress={props.onDiscard}>
          <Trash2 size={20} />
        </PanelButton>
        <PanelButton
          label={paused ? "继续" : "暂停"}
          main
          disabled={saving}
          onPress={() => void toggleRecordingPause()}
        >
          {paused ? <Mic size={26} /> : <Pause size={26} />}
        </PanelButton>
        <PanelButton
          label={state.kind === "replace" ? "完成并替换" : "完成并插入"}
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
        <InfoRow icon={<MapPin size={17} />} label={state.kind === "replace" ? "替换" : "插入位置"}>
          {state.kind === "replace" ? "原音频块" : "正文里的「录音将插入这里」"}
        </InfoRow>
        <InfoRow icon={<HardDrive size={17} />} label="已占用">
          {formatSize(used)}
          {remainingHours != null ? ` · 剩余约 ${remainingHours} 小时` : ""}
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
          ? "calc(var(--mobile-overlay-bottom) + 56px)"
          : "calc(var(--mobile-safe-bottom) + 12px)",
      }}
    >
      <button
        type="button"
        aria-label="展开录音面板"
        className="flex min-w-0 flex-1 items-center gap-2.5"
        onClick={() => setExpanded(true)}
      >
        <StatusDot paused={paused || starting} />
        <span className="min-w-11 text-[15px] font-semibold tabular-nums">
          {formatRecordingTime(state.elapsedMs)}
        </span>
        {paused || saving || starting ? (
          <span className="min-w-0 flex-1 truncate text-left text-[13px] opacity-80">
            {saving
              ? "正在保存…"
              : starting
                ? "正在启动麦克风…"
                : state.pauseReason
                  ? PAUSE_LABELS[state.pauseReason]
                  : "已暂停"}
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
        aria-label={paused ? "继续录音" : "暂停录音"}
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
        完成
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
            aria-label="收起录音面板"
            className="text-ink-2 flex size-10 items-center justify-center"
            onClick={() => setExpanded(false)}
          >
            <ChevronDown size={20} />
          </button>
          <span className="flex-1 text-center text-[15px] font-semibold">
            {paused ? "录音已暂停" : "录音中"}
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
        title="放弃这段录音？"
        description={discardConfirmText(state)}
        confirmText="放弃"
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
