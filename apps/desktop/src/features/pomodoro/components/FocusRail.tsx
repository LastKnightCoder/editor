/**
 * 专注左栏：预设纵向列表（点行打开预设详情抽屉，点行尾 ▶ 或数字键直接开始），
 * 专注中顶部换成竖版播放器（时间 / 状态 / 进度线 / 小窗 · 沉浸 / 背景音 / 结束 / 暂停继续）。
 * 「专注于…」可选关联今天的日程或待办：开始前由页面暂存、随任一开始入口带上；专注中直接改会话绑定。
 *
 * 预设行的数字键提示与 ▶ 按钮共用固定槽位原位交叉淡入——悬停不改变行宽。
 * 行可纵向拖动排序（落 reorderPomodoroPresets），右键开始 / 编辑 / 归档；专注中不可开始（详情照常可看）。
 * 结束时专注不足 5 分钟：弹确认对话框（主进程会直接丢弃这次记录）。
 */

import { useState, type DragEvent } from "react";
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
import { ConfirmDialog, ContextMenu, IconButton, Menu, Tooltip, cn, toast } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import { isElectron } from "@/electron";
import { openPomodoroImmersiveWindow, openPomodoroMiniWindow } from "@/commands/window";
import type { PomodoroBindTarget, PomodoroPreset, PomodoroSession } from "@/types";
import { formatClock, formatHM, presetShort, type SessionTiming } from "../model";
import { pomodoroActions } from "../timerStore";
import { BindPicker, type BindChoice } from "./BindPicker";
import { PresetDot } from "./PomodoroBits";
import { SoundPopover } from "./SoundPopover";

export function FocusRail({
  presets,
  session,
  timing,
  presetName,
  openPresetId,
  bind,
  onBind,
  onStart,
  onOpen,
  onCreate,
  onEdit,
  onArchive,
  onReorder,
}: {
  presets: PomodoroPreset[];
  session: PomodoroSession | null;
  timing: SessionTiming | null;
  presetName: string;
  /** 详情抽屉打开中的预设 */
  openPresetId: number | null;
  /** 开始前暂存的「专注于…」选择 */
  bind: BindChoice | null;
  onBind(choice: BindChoice | null): void;
  onStart(preset: PomodoroPreset): void;
  onOpen(preset: PomodoroPreset): void;
  onCreate(anchor: HTMLElement): void;
  onEdit(preset: PomodoroPreset, anchor: HTMLElement): void;
  onArchive(preset: PomodoroPreset): void;
  onReorder(orderedIds: number[]): void;
}) {
  const live = session !== null && timing !== null;
  return (
    <aside className="flex min-h-0 flex-col pb-4 pl-6 pr-4 pt-3">
      {live ? (
        <Player key={session.startTime} session={session} timing={timing} presetName={presetName} />
      ) : (
        <div className="mb-2 px-2.5">
          <h2 className="text-tau-title font-semibold">开始专注</h2>
          <p className="text-ink-3 text-tau-sm mt-0.5">
            {presets.length ? "点 ▶ 或数字键开始 · 点预设看详情" : "先建一个预设"}
          </p>
          <BindPicker value={bind} onChange={onBind} className="-mx-2 mt-1.5 w-[calc(100%+16px)]" />
        </div>
      )}
      <PresetList
        presets={presets}
        disabled={live}
        onStart={onStart}
        openPresetId={openPresetId}
        onOpen={onOpen}
        onCreate={onCreate}
        onEdit={onEdit}
        onArchive={onArchive}
        onReorder={onReorder}
      />
    </aside>
  );
}

/* ---------- 预设列表 ---------- */

function PresetList({
  presets,
  disabled,
  onStart,
  openPresetId,
  onOpen,
  onCreate,
  onEdit,
  onArchive,
  onReorder,
}: {
  presets: PomodoroPreset[];
  /** 专注中：不可开始、不可拖动，详情与右键编辑 / 归档照常 */
  disabled: boolean;
  onStart(preset: PomodoroPreset): void;
  openPresetId: number | null;
  onOpen(preset: PomodoroPreset): void;
  onCreate(anchor: HTMLElement): void;
  onEdit(preset: PomodoroPreset, anchor: HTMLElement): void;
  onArchive(preset: PomodoroPreset): void;
  onReorder(orderedIds: number[]): void;
}) {
  const [drag, setDrag] = useState<{ id: number; overId: number | null; before: boolean } | null>(
    null
  );

  const start = (preset: PomodoroPreset) => {
    if (!disabled) onStart(preset);
  };

  const onDragOver = (e: DragEvent<HTMLElement>, target: PomodoroPreset) => {
    if (!drag) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
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
      {disabled && (
        <h3 className="text-ink-3 text-tau-sm mb-1 mt-5 px-2.5">预设 · 结束当前专注后可开始</h3>
      )}
      {/* -mr-1.5：FadeScroll 右侧 6px 透明边吃进栏内边距，行右缘与标题对齐 */}
      <FadeScroll className="-mr-1.5 flex min-h-0 flex-1 flex-col gap-px py-1">
        {presets.map((preset, index) => (
          <ContextMenu
            key={preset.id}
            content={
              <>
                <Menu.Item
                  disabled={disabled}
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
            {/* 行本身打开详情；▶ 是独立按钮（不能嵌套在 button 里，行用 role=button） */}
            <div
              role="button"
              tabIndex={0}
              draggable={!disabled}
              aria-current={openPresetId === preset.id || undefined}
              data-preset-chip={preset.id}
              title={disabled ? preset.name : `「${preset.name}」详情 · 右键编辑 · 拖动排序`}
              onClick={() => onOpen(preset)}
              onKeyDown={e => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(preset);
                }
              }}
              onDragStart={e => {
                e.dataTransfer.effectAllowed = "move";
                setDrag({ id: preset.id, overId: null, before: true });
              }}
              onDragEnd={() => setDrag(null)}
              onDragOver={e => onDragOver(e, preset)}
              onDrop={e => onDrop(e, preset)}
              className={cn(
                "group/chip text-tau-body relative flex min-h-10 w-full flex-none cursor-pointer items-center gap-2 rounded-[10px] pl-2.5 pr-2 text-left font-medium outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
                "transition-[background,opacity,box-shadow] duration-150",
                openPresetId === preset.id ? "bg-selected" : "hover:bg-hover",
                drag?.id === preset.id && "opacity-40",
                drag?.overId === preset.id &&
                  drag.id !== preset.id &&
                  (drag.before
                    ? "shadow-[inset_0_2px_0_var(--tau-accent)]"
                    : "shadow-[inset_0_-2px_0_var(--tau-accent)]")
              )}
            >
              <PresetDot presetId={preset.id} />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  openPresetId === preset.id && "text-accent-text"
                )}
              >
                {preset.name}
              </span>
              <span className="text-ink-3 text-tau-sm flex-none font-normal tabular-nums">
                {presetShort(preset)}
              </span>
              {/* 固定槽位：数字键提示 ⇄ ▶ 按钮 原位交叉淡入 */}
              <span className="relative ml-0.5 grid size-[18px] flex-none place-items-center">
                {index < 9 && (
                  <kbd
                    className={cn(
                      "bg-hover text-ink-2 absolute inset-0 grid place-items-center rounded-[5px] font-mono text-[11px] leading-none transition-[opacity,transform] duration-150",
                      !disabled && "group-hover/chip:scale-75 group-hover/chip:opacity-0"
                    )}
                  >
                    {index + 1}
                  </kbd>
                )}
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`开始「${preset.name}」`}
                    title={`开始「${preset.name}」${index < 9 ? `（${index + 1}）` : ""}`}
                    data-preset-start={preset.id}
                    draggable={false}
                    onClick={e => {
                      e.stopPropagation();
                      start(preset);
                    }}
                    className="bg-accent text-ink-inverse hover:bg-accent-hover absolute -inset-[3px] grid scale-75 place-items-center rounded-full opacity-0 outline-none transition-[opacity,transform,background] duration-150 focus-visible:scale-100 focus-visible:opacity-100 group-hover/chip:scale-100 group-hover/chip:opacity-100"
                  >
                    <Play className="ml-px size-2.5 fill-current" strokeWidth={0} />
                  </button>
                )}
              </span>
            </div>
          </ContextMenu>
        ))}
        {presets.length === 0 && (
          <button
            type="button"
            onClick={e => onCreate(e.currentTarget)}
            className="border-line-1 text-ink-2 hover:bg-hover hover:text-ink-1 text-tau-body inline-flex h-10 flex-none items-center gap-1.5 rounded-[10px] border border-dashed px-3 transition-colors duration-150"
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            新建预设
          </button>
        )}
      </FadeScroll>
    </>
  );
}

/* ---------- 专注中：竖版播放器 ---------- */

/** 会话当前绑定（选择器高亮用）：有事件按事件，否则按待办 */
function sessionTarget(session: PomodoroSession): PomodoroBindTarget {
  return session.boundEventId != null
    ? { kind: "event", eventId: session.boundEventId }
    : { kind: "todo", todoId: session.boundTodoId ?? 0 };
}

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
    <section className="border-line-1 relative flex-none overflow-hidden rounded-[18px] border px-5 pb-4 pt-4">
      <div className="flex items-center gap-[7px] font-semibold">
        <PresetDot presetId={session.presetId} />
        {/* 有关联时主标题是关联对象，预设名降为副文字 */}
        <span className="min-w-0 truncate">{session.boundTitle ?? presetName}</span>
        {session.boundTitle && (
          <span className="text-ink-3 text-tau-sm min-w-[3em] shrink truncate font-normal">
            {presetName}
          </span>
        )}
        <span
          className={cn(
            "text-tau-sm ml-auto flex-none font-medium",
            timing.paused ? "text-warn" : "text-accent-text"
          )}
        >
          {timing.paused ? "已暂停" : countdown ? "剩余" : "已专注"}
          {session.pauseCount > 0 && (
            <span className="text-ink-3 font-normal"> · 暂停 {session.pauseCount} 次</span>
          )}
        </span>
      </div>
      <div className="mt-2 text-[44px] font-medium tabular-nums leading-none tracking-[-0.03em]">
        {formatClock(timing.displayMs)}
      </div>
      {/* 栏窄：只放起止时间一行，暂停次数移到状态标签后，避免折行 */}
      <div className="text-ink-2 text-tau-sm mt-2 truncate whitespace-nowrap tabular-nums">
        {formatHM(session.startTime)} 开始
        {timing.endsAt != null && ` → ${formatHM(timing.endsAt)} 结束`}
      </div>

      <BindPicker
        value={
          session.boundTitle ? { target: sessionTarget(session), title: session.boundTitle } : null
        }
        onChange={choice =>
          void pomodoroActions.bind(choice?.target ?? null).catch(() => toast.error("关联失败"))
        }
        className="-mx-2 mt-1.5 w-[calc(100%+16px)]"
      />

      <div className="bg-track mt-3 h-[3px] overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-1000 ease-linear",
            timing.paused ? "bg-warn" : "bg-accent"
          )}
          style={{ width: `${timing.progress * 100}%` }}
        />
      </div>

      <div className="mt-3.5 flex items-center gap-0.5">
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
            "text-ink-inverse ml-auto grid size-[42px] flex-none place-items-center rounded-full transition-colors duration-150",
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
    </section>
  );
}
