import React, { memo, useState } from "react";
import { Clapperboard, Maximize, Minus, Pencil, PenLine, Play, Plus, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, IconButton, Menu, Popover, Tooltip } from "@tau/ui";

import { PresentationSequence, SketchLevel, SketchMode } from "../../types";
import {
  GRID_SIZE_OPTIONS,
  SKETCH_LEVEL_OPTIONS,
  SKETCH_MODE_OPTIONS,
  ZOOM_PRESETS,
  sketchLevelLabel,
} from "../../constants";
import {
  useBoard,
  usePageSketch,
  usePresentationState,
  useReadonly,
  useSelection,
} from "../../hooks";
import { SketchTransforms } from "../../transforms";
import { ChromeBar, ChromeButton, ChromeGap, stopCanvasEvents } from "../../chrome";

interface StatusBarProps {
  gridVisible?: boolean;
  gridSize?: number;
  zoom: number;
  sequences: PresentationSequence[];
  onGridVisibleChange: (visible: boolean) => void;
  onGridSizeChange: (size: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomTo: (zoomValue: number) => void;
  onFitAll: () => void;
  onFitSelection: () => void;
  onStartPresentation: (sequenceId: string) => void;
  onEditSequence: (sequenceId: string) => void;
  onDeleteSequence: (sequenceId: string) => void;
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * 右下状态栏：画风（D-107）· − 缩放百分比 ＋ · 全览 · 演示（D-111）。
 * 百分比点开是「视图」菜单：适应全部 / 适应选中 / 缩放档位 / 点阵开关与点距——
 * 低频的背景设置收进菜单，顶层只留缩放与全览。
 * 「演示」一个入口收拢演示序列：点序列即放映，悬停出编辑 / 删除，底部「新建演示序列」。
 */
const StatusBar = memo((props: StatusBarProps) => {
  const {
    gridVisible = false,
    gridSize,
    zoom,
    sequences,
    onGridVisibleChange,
    onGridSizeChange,
    onZoomIn,
    onZoomOut,
    onZoomTo,
    onFitAll,
    onFitSelection,
    onStartPresentation,
    onEditSequence,
    onDeleteSequence,
    ref,
  } = props;

  // 序列列表直接订阅 presentationManager（父组件不会因序列增删而重渲染，prop 只作初值兜底）
  const { isPresentationMode, sequences: liveSequences } = usePresentationState();
  const hasSelection = (useSelection()?.selectedElements.length ?? 0) > 0;
  if (isPresentationMode) return null;

  return (
    <ChromeBar ref={ref} className="bottom-3 right-3 text-[12px]">
      <SketchEntry />
      <ChromeButton label="缩小" kbd="⌘−" tooltipPlacement="top" onClick={onZoomOut}>
        <Minus strokeWidth={1.75} />
      </ChromeButton>
      <Menu
        align="end"
        className="w-[220px]"
        trigger={
          <button
            type="button"
            aria-label="视图"
            className="text-ink-2 hover:bg-hover hover:text-ink-1 aria-expanded:bg-press h-[30px] min-w-12 cursor-pointer rounded-[8px] text-center tabular-nums"
          >
            {Math.round(zoom * 100)}%
          </button>
        }
      >
        <Menu.Item kbd="⇧1" onSelect={onFitAll}>
          适应全部
        </Menu.Item>
        <Menu.Item kbd="⇧2" disabled={!hasSelection} onSelect={onFitSelection}>
          适应选中
        </Menu.Item>
        <Menu.Separator />
        <Menu.Group>缩放</Menu.Group>
        <Menu.RadioGroup
          value={String(ZOOM_PRESETS.find(z => Math.abs(zoom - z) < 0.001) ?? "")}
          onValueChange={v => onZoomTo(Number(v))}
        >
          {ZOOM_PRESETS.map(z => (
            <Menu.RadioItem key={z} value={String(z)} kbd={z === 1 ? "⇧0" : undefined}>
              {Math.round(z * 100)}%
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
        <Menu.Separator />
        <Menu.CheckboxItem checked={gridVisible} onCheckedChange={onGridVisibleChange}>
          显示点阵
        </Menu.CheckboxItem>
        <Menu.Submenu label="点距" disabled={!gridVisible}>
          <Menu.RadioGroup
            value={String(gridSize ?? "")}
            onValueChange={v => onGridSizeChange(Number(v))}
          >
            {GRID_SIZE_OPTIONS.map(o => (
              <Menu.RadioItem key={o.value} value={String(o.value)} kbd={String(o.value)}>
                {o.label}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Submenu>
      </Menu>
      <ChromeButton label="放大" kbd="⌘＋" tooltipPlacement="top" onClick={onZoomIn}>
        <Plus strokeWidth={1.75} />
      </ChromeButton>
      <ChromeButton label="全览" kbd="Z" tooltipPlacement="top" onClick={onFitAll}>
        <Maximize strokeWidth={1.75} />
      </ChromeButton>
      <ChromeGap className="w-1" />
      <SequenceEntry
        sequences={liveSequences ?? sequences}
        onStart={onStartPresentation}
        onEdit={onEditSequence}
        onDelete={onDeleteSequence}
      />
    </ChromeBar>
  );
});

/** 页级画风：手绘 / 普通 + 默认笔触；单独设置过的元素不受影响 */
function SketchEntry() {
  const board = useBoard();
  const sketch = usePageSketch();
  const readonly = useReadonly();
  if (readonly) return null;
  const isSketch = sketch.mode === "sketch";

  return (
    <>
      <Menu
        align="end"
        className="w-[220px]"
        trigger={
          <Button variant="ghost" icon={PenLine} className="aria-expanded:bg-press h-[30px] px-2.5">
            {isSketch ? `手绘 · ${sketchLevelLabel(sketch.level)}` : "普通"}
          </Button>
        }
      >
        <Menu.Group>画风</Menu.Group>
        <Menu.RadioGroup
          value={sketch.mode}
          onValueChange={v => SketchTransforms.setPageSketch(board, { mode: v as SketchMode })}
        >
          {SKETCH_MODE_OPTIONS.map(o => (
            <Menu.RadioItem key={o.value} value={o.value}>
              {o.label}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
        <Menu.Separator />
        <Menu.Group>默认笔触</Menu.Group>
        <Menu.RadioGroup
          value={sketch.level}
          onValueChange={v => SketchTransforms.setPageSketch(board, { level: v as SketchLevel })}
        >
          {SKETCH_LEVEL_OPTIONS.map(o => (
            <Menu.RadioItem key={o.value} value={o.value} disabled={!isSketch}>
              {o.label}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
        <div className="text-ink-3 text-tau-tiny px-2.5 pb-1 pt-1.5">
          单独设置过画风的元素不受影响
        </div>
      </Menu>
      <ChromeGap className="w-1" />
    </>
  );
}

function SequenceEntry({
  sequences,
  onStart,
  onEdit,
  onDelete,
}: {
  sequences: PresentationSequence[];
  onStart: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const board = useBoard();
  const { isCreatingSequence } = usePresentationState();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<PresentationSequence | null>(null);
  const [confirmStopCreating, setConfirmStopCreating] = useState(false);

  const createNew = () => {
    // 正在创建序列时 startCreatingSequence 是 no-op，只会白白清空选区——先确认停止
    if (isCreatingSequence) {
      setConfirmStopCreating(true);
      return;
    }
    setOpen(false);
    board.apply({
      type: "set_selection",
      properties: board.selection,
      newProperties: { selectedElements: [], selectArea: null },
    });
    board.presentationManager.startCreatingSequence();
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={setOpen}
        placement="top-end"
        arrow={false}
        trigger={
          <Button variant="ghost" icon={Play} className="aria-expanded:bg-press h-[30px] px-2.5">
            演示
          </Button>
        }
      >
        <div {...stopCanvasEvents} className="w-[268px] px-2.5 pb-2.5 pt-3">
          <div className="text-ink-1 mb-1.5 px-1.5 text-[12.5px] font-semibold">演示序列</div>
          {sequences.length === 0 ? (
            <div className="text-ink-3 px-1.5 pb-2 text-[12.5px]">还没有演示序列</div>
          ) : (
            <div className="flex flex-col gap-px">
              {sequences.map(s => (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setOpen(false);
                    onStart(s.id);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      setOpen(false);
                      onStart(s.id);
                    }
                  }}
                  className="hover:bg-hover group/seq flex h-10 cursor-pointer items-center gap-2.5 rounded-[9px] pl-2 pr-1 outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
                >
                  <span className="bg-accent-soft text-accent-text grid size-[26px] flex-none place-items-center rounded-[8px]">
                    <Play size={12} fill="currentColor" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="text-ink-1 block truncate text-[13px]">{s.name}</span>
                    <span className="text-ink-3 block text-[11.5px]">{s.frames.length} 帧</span>
                  </span>
                  {/* 编辑 / 删除占固定槽位，悬停只改透明度 */}
                  <span className="flex opacity-0 group-focus-within/seq:opacity-100 group-hover/seq:opacity-100">
                    <Tooltip content="编辑" placement="top" arrow={false}>
                      <IconButton
                        aria-label="编辑"
                        className="size-[26px]"
                        onClick={e => {
                          e.stopPropagation();
                          setOpen(false);
                          onEdit(s.id);
                        }}
                      >
                        <Pencil size={14} strokeWidth={1.75} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip content="删除" placement="top" arrow={false}>
                      <IconButton
                        aria-label="删除"
                        className="size-[26px]"
                        onClick={e => {
                          e.stopPropagation();
                          setOpen(false);
                          setDeleting(s);
                        }}
                      >
                        <Trash2 size={14} strokeWidth={1.75} />
                      </IconButton>
                    </Tooltip>
                  </span>
                </div>
              ))}
            </div>
          )}
          <Button variant="soft" icon={Clapperboard} block className="mt-2" onClick={createNew}>
            新建演示序列
          </Button>
        </div>
      </Popover>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={v => !v && setDeleting(null)}
        danger
        title={`删除「${deleting?.name ?? ""}」？`}
        description={`这个序列的 ${deleting?.frames.length ?? 0} 帧会一起删除，画布上的元素不受影响。`}
        confirmText="删除"
        onConfirm={() => {
          if (deleting) onDelete(deleting.id);
          setDeleting(null);
        }}
      />
      <ConfirmDialog
        open={confirmStopCreating}
        onOpenChange={v => !v && setConfirmStopCreating(false)}
        danger
        title="确定停止创建序列吗？"
        description="停止后会关闭创建面板，正在创建的序列不会被保存。"
        confirmText="停止创建"
        onConfirm={() => {
          setConfirmStopCreating(false);
          setOpen(false);
          board.presentationManager.stopCreatingSequence();
        }}
      />
    </>
  );
}

export default StatusBar;
