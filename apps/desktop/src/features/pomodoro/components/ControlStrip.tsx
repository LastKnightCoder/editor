/**
 * 控制条（页面顶部常驻）：空闲 = 预设快速开始 chips；专注中 = 播放器
 * （时间 / 状态 / 小窗 · 沉浸 / 背景音 / 结束 / 暂停继续 + 底边进度线）。
 *
 * chip 的数字键提示与播放图标共用固定槽位原位交叉淡入——悬停不改变 chip 宽度。
 * chip 可拖动排序（落 reorderPomodoroPresets），右键开始 / 编辑 / 归档。
 * 结束时专注不足 5 分钟：弹确认对话框（主进程会直接丢弃这次记录）；控制条本身不变形。
 */

import { useLayoutEffect, useState, type CSSProperties, type DragEvent } from "react";
import {
  Archive,
  Expand,
  Music,
  Pause,
  Pencil,
  PictureInPicture2,
  Play,
  Plus,
  Square,
} from "lucide-react";
import { ConfirmDialog, ContextMenu, IconButton, Menu, Tooltip, cn } from "@tau/ui";
import { isElectron } from "@/electron";
import { openPomodoroImmersiveWindow, openPomodoroMiniWindow } from "@/commands/window";
import type { PomodoroPreset, PomodoroSession } from "@/types";
import { formatClock, formatHM, presetShort, type SessionTiming } from "../model";
import { pomodoroActions } from "../timerStore";
import { PresetDot } from "./PomodoroBits";
import { SoundPopover } from "./SoundPopover";

const FADE_RIGHT: CSSProperties = {
  maskImage: "linear-gradient(90deg, #000 0%, #000 calc(100% - 28px), transparent 100%)",
  WebkitMaskImage: "linear-gradient(90deg, #000 0%, #000 calc(100% - 28px), transparent 100%)",
};

export function ControlStrip({
  presets,
  session,
  timing,
  presetName,
  onCreate,
  onEdit,
  onArchive,
  onReorder,
}: {
  presets: PomodoroPreset[];
  session: PomodoroSession | null;
  timing: SessionTiming | null;
  presetName: string;
  onCreate(anchor: HTMLElement): void;
  onEdit(preset: PomodoroPreset, anchor: HTMLElement): void;
  onArchive(preset: PomodoroPreset): void;
  onReorder(orderedIds: number[]): void;
}) {
  return (
    <div className="border-line-1 relative flex h-[76px] flex-none items-center gap-3.5 overflow-hidden rounded-[18px] border pl-[22px] pr-4">
      {session && timing ? (
        <Player key={session.startTime} session={session} timing={timing} presetName={presetName} />
      ) : (
        <QuickStart
          presets={presets}
          onCreate={onCreate}
          onEdit={onEdit}
          onArchive={onArchive}
          onReorder={onReorder}
        />
      )}
    </div>
  );
}

/* ---------- 空闲：快速开始 ---------- */

function QuickStart({
  presets,
  onCreate,
  onEdit,
  onArchive,
  onReorder,
}: {
  presets: PomodoroPreset[];
  onCreate(anchor: HTMLElement): void;
  onEdit(preset: PomodoroPreset, anchor: HTMLElement): void;
  onArchive(preset: PomodoroPreset): void;
  onReorder(orderedIds: number[]): void;
}) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [drag, setDrag] = useState<{ id: number; overId: number | null; before: boolean } | null>(
    null
  );

  useLayoutEffect(() => {
    const el = scrollEl;
    if (!el) return;
    const measure = () => {
      setOverflowing(el.scrollWidth > el.clientWidth);
      setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 8);
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [scrollEl, presets]);

  const start = (preset: PomodoroPreset) => void pomodoroActions.start(preset);

  const onDragOver = (e: DragEvent<HTMLElement>, target: PomodoroPreset) => {
    if (!drag) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientX < rect.left + rect.width / 2;
    if (drag.overId !== target.id || drag.before !== before)
      setDrag({ ...drag, overId: target.id, before });
  };
  const onDrop = (e: DragEvent<HTMLElement>, target: PomodoroPreset) => {
    e.preventDefault();
    if (!drag || drag.id === target.id) return setDrag(null);
    const ids = presets.map(p => p.id).filter(id => id !== drag.id);
    ids.splice(ids.indexOf(target.id) + (drag.before ? 0 : 1), 0, drag.id);
    setDrag(null);
    onReorder(ids);
  };

  return (
    <>
      <div className="flex-none whitespace-nowrap">
        <div className="text-tau-title font-semibold">开始专注</div>
        <div className="text-ink-3 text-tau-sm">
          {presets.length ? "点预设立即开始" : "先建一个预设"}
        </div>
      </div>
      {/* 溢出时出现的横向滚动条（全局 6px，占位）压在底部：顶部补等高留白，chips 仍上下居中 */}
      <div
        ref={setScrollEl}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-1",
          overflowing ? "pt-2.5" : "pt-1"
        )}
        style={canScrollRight ? FADE_RIGHT : undefined}
      >
        {presets.map((preset, index) => (
          <ContextMenu
            key={preset.id}
            content={
              <>
                <Menu.Item
                  icon={<Play className="size-[15px]" strokeWidth={1.75} />}
                  onSelect={() => start(preset)}
                >
                  开始专注
                </Menu.Item>
                <Menu.Item
                  icon={<Pencil className="size-[15px]" strokeWidth={1.75} />}
                  onSelect={() => {
                    const el = document.querySelector<HTMLElement>(
                      `[data-preset-chip="${preset.id}"]`
                    );
                    if (el) onEdit(preset, el);
                  }}
                >
                  编辑
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item
                  icon={<Archive className="size-[15px]" strokeWidth={1.75} />}
                  onSelect={() => onArchive(preset)}
                >
                  归档
                </Menu.Item>
              </>
            }
          >
            <button
              type="button"
              draggable
              data-preset-chip={preset.id}
              title={`开始「${preset.name}」· 右键编辑 · 拖动排序`}
              onClick={() => start(preset)}
              onDragStart={e => {
                e.dataTransfer.effectAllowed = "move";
                setDrag({ id: preset.id, overId: null, before: true });
              }}
              onDragEnd={() => setDrag(null)}
              onDragOver={e => onDragOver(e, preset)}
              onDrop={e => onDrop(e, preset)}
              className={cn(
                "group/chip border-line-1 text-tau-body relative inline-flex h-9 flex-none items-center gap-[7px] rounded-[11px] border pl-[11px] pr-2.5 font-medium",
                "hover:bg-hover transition-[background,border-color,opacity] duration-150 hover:border-transparent",
                drag?.id === preset.id && "opacity-40",
                drag?.overId === preset.id &&
                  drag.id !== preset.id &&
                  (drag.before
                    ? "shadow-[-3px_0_0_var(--tau-accent)]"
                    : "shadow-[3px_0_0_var(--tau-accent)]")
              )}
            >
              <PresetDot presetId={preset.id} />
              {preset.name}
              <span className="text-ink-3 text-tau-sm font-normal tabular-nums">
                {presetShort(preset)}
              </span>
              {/* 固定槽位：数字键提示 ⇄ 播放图标 原位交叉淡入 */}
              <span className="relative ml-px grid size-[18px] flex-none place-items-center">
                {index < 9 && (
                  <kbd className="bg-hover text-ink-2 absolute inset-0 grid place-items-center rounded-[5px] font-mono text-[11px] leading-none transition-[opacity,transform] duration-150 group-hover/chip:scale-75 group-hover/chip:opacity-0">
                    {index + 1}
                  </kbd>
                )}
                <span className="bg-accent text-ink-inverse absolute inset-0 grid scale-75 place-items-center rounded-full opacity-0 transition-[opacity,transform] duration-150 group-hover/chip:scale-100 group-hover/chip:opacity-100">
                  <Play className="ml-px size-2 fill-current" strokeWidth={0} />
                </span>
              </span>
            </button>
          </ContextMenu>
        ))}
        <button
          type="button"
          onClick={e => onCreate(e.currentTarget)}
          className="border-line-1 text-ink-2 hover:bg-hover hover:text-ink-1 text-tau-body inline-flex h-9 flex-none items-center gap-1.5 rounded-[11px] border border-dashed px-3 transition-colors duration-150"
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
          预设
        </button>
      </div>
    </>
  );
}

/* ---------- 专注中：播放器 ---------- */

function Player({
  session,
  timing,
  presetName,
}: {
  session: PomodoroSession;
  timing: SessionTiming;
  presetName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const countdown = timing.remainMs !== undefined;

  const stop = () => {
    if (timing.willDiscard) return setConfirming(true);
    void pomodoroActions.stop();
  };

  return (
    <>
      <div className="min-w-[118px] text-[34px] font-medium tabular-nums leading-none tracking-[-0.03em]">
        {formatClock(timing.displayMs)}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-[7px] font-semibold">
          <PresetDot presetId={session.presetId} />
          <span className="truncate">{presetName}</span>
        </div>
        <div className="text-ink-2 text-tau-sm mt-0.5 truncate tabular-nums">
          <span className={cn("font-medium", timing.paused ? "text-warn" : "text-accent-text")}>
            {timing.paused ? "已暂停" : countdown ? "剩余" : "已专注"}
          </span>
          {` · ${formatHM(session.startTime)} 开始`}
          {timing.endsAt != null && ` · 预计 ${formatHM(timing.endsAt)} 结束`}
          {session.pauseCount > 0 && ` · 暂停 ${session.pauseCount} 次`}
        </div>
      </div>

      <div className="ml-auto flex flex-none items-center gap-1">
        {isElectron && (
          <>
            <Tooltip content="小窗">
              <IconButton aria-label="小窗" onClick={() => void openPomodoroMiniWindow()}>
                <PictureInPicture2 className="size-4" strokeWidth={1.75} />
              </IconButton>
            </Tooltip>
            <Tooltip content="沉浸（I）">
              <IconButton aria-label="沉浸" onClick={() => void openPomodoroImmersiveWindow()}>
                <Expand className="size-4" strokeWidth={1.75} />
              </IconButton>
            </Tooltip>
            <span aria-hidden className="bg-line-1 mx-1.5 h-[18px] w-px" />
          </>
        )}
        <SoundPopover
          trigger={
            <IconButton aria-label="背景音" title="背景音">
              <Music className="size-4" strokeWidth={1.75} />
            </IconButton>
          }
        />
        <Tooltip content="结束">
          <IconButton aria-label="结束" onClick={stop}>
            <Square className="size-4" strokeWidth={1.75} />
          </IconButton>
        </Tooltip>
        <button
          type="button"
          aria-label={timing.paused ? "继续" : "暂停"}
          title={`${timing.paused ? "继续" : "暂停"}（空格）`}
          onClick={() => void pomodoroActions.toggle()}
          className={cn(
            "text-ink-inverse ml-1.5 grid size-[42px] place-items-center rounded-full transition-colors duration-150",
            timing.paused ? "bg-warn" : "bg-accent hover:bg-accent-hover"
          )}
        >
          {timing.paused ? (
            <Play className="ml-0.5 size-[15px] fill-current" strokeWidth={0} />
          ) : (
            <Pause className="size-[15px] fill-current" strokeWidth={0} />
          )}
        </button>
      </div>

      {/* 确认期间计时照走；越过 5 分钟后点「仍然结束」即正常记录 */}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="结束这次专注？"
        description="专注还不足 5 分钟，结束后不会留下记录。"
        cancelText="继续专注"
        confirmText="仍然结束"
        danger
        onConfirm={() => void pomodoroActions.stop()}
      />

      <div className="bg-track absolute inset-x-0 bottom-0 h-[3px]">
        <div
          className={cn(
            "h-full transition-[width] duration-1000 ease-linear",
            timing.paused ? "bg-warn" : "bg-accent"
          )}
          style={{ width: `${timing.progress * 100}%` }}
        />
      </div>
    </>
  );
}
