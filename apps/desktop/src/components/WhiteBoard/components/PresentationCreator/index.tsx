/**
 * 演示序列创建面板（D-049 画布 chrome 换皮）：
 * 画布右上浮层——头部即序列名称输入框 + 关闭；工具行 添加帧 / 调整视口 / 预览；
 * 行式帧列表；底部 取消 / 保存。只换外壳，帧增删、视口调整、预览逻辑保持原样。
 */

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";
import { Button, ConfirmDialog, IconButton, Tooltip, cn, toast, useEdgeFade } from "@tau/ui";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Film,
  MoveDiagonal2,
  Plus,
  ScanEye,
  Trash2,
  X,
} from "lucide-react";
import usePresentationState from "../../hooks/usePresentationState";
import { useBoard } from "../../hooks";
import { ViewPort, PresentationFrame } from "../../types";
import { ViewPortTransforms } from "../../transforms/ViewPortTransforms";
import { ChromeBar, ChromeButton, ChromeGap, Slider, stopCanvasEvents } from "../../chrome";

const PresentationCreator: React.FC = () => {
  const board = useBoard();
  const [frames, setFrames] = useState<PresentationFrame[]>([]);
  const [currentFrame, setCurrentFrame] = useState<PresentationFrame | null>(null);
  const { isPresentationMode, isCreatingSequence } = usePresentationState();

  const [sequenceName, setSequenceName] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isAdjustingViewport, setIsAdjustingViewport] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentSequenceId, setCurrentSequenceId] = useState<string | undefined>(undefined);
  // 待确认删除的帧：开合单独受控，关闭退场期间保留文案
  const [pendingRemove, setPendingRemove] = useState<{
    id: string;
    index: number;
  } | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  // 帧列表滚动区：边缘渐隐（callback ref 接线）
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(listEl);

  // 视口调整相关状态
  const [viewportPadding, setViewportPadding] = useState(50);
  const resizeHandleRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const currentViewportRef = useRef<ViewPort | null>(null);

  // 每次创建序列时初始化状态
  useEffect(() => {
    if (isCreatingSequence) {
      // 检查是否有当前序列（编辑模式）
      const currentSequenceData = board.presentationManager.getCurrentSequenceFrames();

      if (currentSequenceData) {
        // 编辑模式：使用现有序列的数据
        setFrames(currentSequenceData.frames);
        setSequenceName(currentSequenceData.name);
        setIsEditMode(true);
        setCurrentSequenceId(currentSequenceData.id);

        // 如果有帧，预览第一帧
        if (currentSequenceData.frames.length > 0) {
          setCurrentFrame(currentSequenceData.frames[0]);
          previewFrame(currentSequenceData.frames[0], false);
        }
      } else {
        // 新建模式：重置所有状态
        setFrames([]);
        setCurrentFrame(null);
        setSequenceName("");
        setIsEditMode(false);
        setCurrentSequenceId(undefined);
      }

      // 无论是编辑还是新建，都重置这些状态
      setPreviewMode(false);
      setPreviewIndex(0);
      setIsAdjustingViewport(false);
    }
  }, [isCreatingSequence]);

  const onCancel = useMemoizedFn(() => {
    board.presentationManager.stopCreatingSequence();
  });

  // 添加当前选中元素作为一帧
  const addCurrentFrame = useMemoizedFn(() => {
    if (!board) return;

    // 创建一个新的帧
    const newFrame = board.presentationManager.createFrameFromSelectedElements(board);

    if (!newFrame) {
      toast.warning("请先选择元素");
      return;
    }

    setFrames(prev => [...prev, newFrame]);
    setCurrentFrame(newFrame);

    toast.success("已添加当前选中元素为一帧");

    board.apply(
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectedElements: [],
          selectArea: null,
        },
      },
      false
    );
  });

  // 删除一帧
  const removeFrame = useMemoizedFn((frameId: string, index: number) => {
    setPendingRemove({ id: frameId, index });
    setRemoveConfirmOpen(true);
  });

  // 确认删除（原 Modal.confirm 的 onOk）
  const confirmRemoveFrame = useMemoizedFn(() => {
    if (!pendingRemove) return;
    const frameId = pendingRemove.id;
    setFrames(prev => prev.filter(frame => frame.id !== frameId));
    if (currentFrame?.id === frameId) {
      setCurrentFrame(null);
    }
  });

  // 预览一帧
  const previewFrame = useMemoizedFn(async (frame: PresentationFrame, animate = true) => {
    if (!board) return;

    // 根据帧内元素动态计算视口
    const elementIdSet = new Set(frame.elements);
    const elements = board.presentationManager.getElementsByIds(elementIdSet);
    const computed = board.presentationManager.fitElementsInViewport(elements);
    if (!computed) return;

    if (animate) {
      // 使用动画过渡
      await ViewPortTransforms.animateToViewport(board, board.viewPort, computed, 500);
    } else {
      // 直接更新视口
      board.apply({
        type: "set_viewport",
        properties: board.viewPort,
        newProperties: computed,
      });
    }

    setCurrentFrame(frame);

    // 更新当前视口引用
    currentViewportRef.current = { ...computed };
  });

  // 开始预览所有帧
  const startPreview = useMemoizedFn(() => {
    if (frames.length === 0) {
      toast.warning("请先添加帧");
      return;
    }

    setPreviewMode(true);
    setPreviewIndex(0);
    previewFrame(frames[0]);
  });

  // 停止预览
  const stopPreview = useMemoizedFn(() => {
    setPreviewMode(false);
  });

  // 预览下一帧
  const previewNext = useMemoizedFn(async () => {
    if (previewIndex < frames.length - 1) {
      const nextIndex = previewIndex + 1;
      setPreviewIndex(nextIndex);
      await previewFrame(frames[nextIndex]);
    }
  });

  // 预览上一帧
  const previewPrev = useMemoizedFn(async () => {
    if (previewIndex > 0) {
      const prevIndex = previewIndex - 1;
      setPreviewIndex(prevIndex);
      await previewFrame(frames[prevIndex]);
    }
  });

  // 保存演示序列
  const saveSequence = useMemoizedFn(() => {
    if (frames.length === 0) {
      toast.warning("请先添加帧");
      return;
    }

    // 名称已并入面板头部的输入框：直接走确认保存（空名称由 handleSave 提示并聚焦输入框）
    handleSave();
  });

  // 确认保存
  const handleSave = useMemoizedFn(() => {
    if (!sequenceName.trim()) {
      toast.warning("请输入演示序列名称");
      nameInputRef.current?.focus();
      return;
    }

    board.presentationManager.saveSequence(sequenceName, frames, currentSequenceId);
    // 保存后自动退出序列制作模式
    board.presentationManager.stopCreatingSequence();
    toast.success(`演示序列 "${sequenceName}" 已${isEditMode ? "更新" : "保存"}`);
  });

  // 开始调整视口
  const startAdjustViewport = useMemoizedFn(() => {
    if (!currentFrame) {
      toast.warning("请先选择一帧");
      return;
    }

    setIsAdjustingViewport(true);

    // 保存当前视口状态（不再写回帧，仅临时调整）
    currentViewportRef.current = { ...board.viewPort };
  });

  // 停止调整视口
  const stopAdjustViewport = useMemoizedFn(() => {
    setIsAdjustingViewport(false);
    // 不再将视口写回帧
  });

  // 调整视口填充
  const handlePaddingChange = useMemoizedFn((value: number) => {
    setViewportPadding(value);

    if (currentFrame && board) {
      // 使用当前帧的元素计算合适的视口，并仅应用到当前视图
      const elementIdSet = new Set(currentFrame.elements);
      const elements = board.presentationManager.getElementsByIds(elementIdSet);
      const newViewport = board.presentationManager.fitElementsInViewport(elements, value);

      if (newViewport) {
        // 更新视口
        board.apply({
          type: "set_viewport",
          properties: board.viewPort,
          newProperties: newViewport,
        });

        // 更新当前视口引用
        currentViewportRef.current = { ...newViewport };
      }
    }
  });

  // 处理拖拽开始
  const handleResizeStart = useMemoizedFn((e: React.MouseEvent) => {
    if (!currentFrame) return;

    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };

    // 添加全局事件监听
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  });

  // 处理拖拽移动
  const handleResizeMove = useMemoizedFn((e: MouseEvent) => {
    if (!isDraggingRef.current || !currentViewportRef.current || !board) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    // 根据拖拽方向调整视口
    const newViewport = { ...currentViewportRef.current };

    // 这里简化处理，实际应该根据拖拽的边或角来调整不同的属性
    newViewport.width += dx / board.viewPort.zoom;
    newViewport.height += dy / board.viewPort.zoom;

    // 更新视口
    board.apply({
      type: "set_viewport",
      properties: board.viewPort,
      newProperties: newViewport,
    });

    // 更新拖拽起始点
    dragStartRef.current = { x: e.clientX, y: e.clientY };

    // 更新当前视口引用
    currentViewportRef.current = { ...newViewport };
  });

  // 处理拖拽结束
  const handleResizeEnd = useMemoizedFn(() => {
    if (!isDraggingRef.current) return;

    isDraggingRef.current = false;

    // 移除全局事件监听
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
    // 不再将视口写回帧
  });

  // 处理键盘事件
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (previewMode) {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          await previewNext();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          await previewPrev();
        } else if (e.key === "Escape") {
          stopPreview();
        }
      } else if (isAdjustingViewport && e.key === "Escape") {
        stopAdjustViewport();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewMode, previewNext, previewPrev, stopPreview, isAdjustingViewport, stopAdjustViewport]);

  // 清理拖拽事件
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [handleResizeMove, handleResizeEnd]);

  if (!isCreatingSequence || isPresentationMode) return null;

  const frameActionsDisabled = previewMode || isAdjustingViewport;

  return (
    <div
      {...stopCanvasEvents}
      className="bg-surface shadow-float ring-line-1 absolute right-3 top-3 z-[1000] flex max-h-[calc(100%-78px)] w-[300px] select-none flex-col rounded-[14px] ring-1"
    >
      {/* 头部：序列名称就地编辑 + 关闭 */}
      <div className="flex flex-none items-center gap-1.5 pb-1 pl-2.5 pr-2 pt-2.5">
        <input
          ref={nameInputRef}
          value={sequenceName}
          placeholder="演示序列名称"
          aria-label="演示序列名称"
          onChange={e => setSequenceName(e.target.value)}
          onKeyDown={e => {
            // 输入时的按键不落到画布快捷键（Backspace 删元素等）
            e.stopPropagation();
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.currentTarget.blur();
            }
          }}
          className={cn(
            "text-ink-1 h-8 min-w-0 flex-1 rounded-[8px] bg-transparent px-1.5 text-[14px] font-semibold outline-none",
            "placeholder:text-ink-3 placeholder:font-medium",
            "ease-tau-out transition-[background-color,box-shadow] duration-150",
            "hover:bg-hover focus:bg-surface focus:shadow-[inset_0_0_0_1px_var(--tau-accent),var(--tau-focus-ring)]"
          )}
        />
        <Tooltip content="关闭" placement="bottom" arrow={false}>
          <IconButton aria-label="关闭" onClick={onCancel} disabled={isAdjustingViewport}>
            <X size={16} strokeWidth={1.75} />
          </IconButton>
        </Tooltip>
      </div>

      {/* 工具行 */}
      <div className="flex flex-none gap-1.5 px-3.5 pb-2.5 pt-1">
        <Tooltip content="把画布上选中的元素加为一帧" placement="bottom" arrow={false}>
          <Button
            variant="soft"
            size="sm"
            icon={Plus}
            onClick={addCurrentFrame}
            disabled={previewMode || isAdjustingViewport}
          >
            添加帧
          </Button>
        </Tooltip>
        <Button
          variant="ghost"
          size="sm"
          icon={isAdjustingViewport ? Check : ScanEye}
          onClick={isAdjustingViewport ? stopAdjustViewport : startAdjustViewport}
          disabled={!currentFrame || previewMode}
          className={cn(isAdjustingViewport && "bg-press text-ink-1")}
        >
          {isAdjustingViewport ? "完成" : "调整视口"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={Eye}
          onClick={startPreview}
          disabled={frames.length === 0 || previewMode || isAdjustingViewport}
        >
          预览
        </Button>
      </div>

      {/* 调整视口：留白滑杆 + 拖拽改尺寸 */}
      {isAdjustingViewport && (
        <div className="mx-3.5 mb-2.5 flex-none">
          <div className="text-ink-3 mb-1.5 text-[11.5px]">视口留白</div>
          <Slider
            label="视口留白"
            min={0}
            max={200}
            value={viewportPadding}
            unit="px"
            onChange={handlePaddingChange}
          />
          <div
            ref={resizeHandleRef}
            onMouseDown={handleResizeStart}
            className="text-ink-3 hover:bg-hover hover:text-ink-2 ease-tau-out mt-2 flex h-7 cursor-nwse-resize items-center gap-1.5 rounded-[8px] px-1.5 text-[11.5px] transition-[background-color,color] duration-150"
          >
            <MoveDiagonal2 size={14} strokeWidth={1.75} />
            拖拽此处调整视口大小
          </div>
        </div>
      )}

      {/* 帧列表 */}
      <div
        ref={setListEl}
        className="edge-fade-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2"
      >
        {frames.length === 0 ? (
          <div className="text-ink-3 px-3 pb-[26px] pt-[22px] text-center text-[12.5px]">
            <Film size={22} strokeWidth={1.5} className="mx-auto mb-2" />
            选中画布上的元素，点「添加帧」
          </div>
        ) : (
          frames.map((frame, index) => {
            const active = currentFrame?.id === frame.id;
            return (
              <div
                key={frame.id}
                role="button"
                tabIndex={0}
                aria-current={active || undefined}
                onClick={() => previewFrame(frame, false)}
                onKeyDown={e => {
                  if (e.key === "Enter" && e.target === e.currentTarget) {
                    previewFrame(frame, false);
                  }
                }}
                className={cn(
                  "ease-tau-out group flex h-[46px] flex-none cursor-pointer items-center gap-2.5 rounded-[10px] pl-1.5 pr-1 outline-none transition-[background-color] duration-150",
                  "focus-visible:shadow-[var(--tau-focus-ring)]",
                  active ? "bg-selected" : "hover:bg-hover"
                )}
              >
                <span
                  className={cn(
                    "w-[18px] flex-none text-center text-[12px] tabular-nums",
                    active ? "text-accent-text font-semibold" : "text-ink-3"
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 text-[12.5px] leading-[1.3]">
                  <span className="text-ink-1 block truncate">第 {index + 1} 帧</span>
                  <span className="text-ink-3 block text-[11.5px]">
                    {frame.elements.length} 个元素
                  </span>
                </span>
                {/* 固定槽位：悬停 / 聚焦只改透明度，不改尺寸 */}
                <span className="ease-tau-out flex flex-none opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                  <Tooltip content="预览此帧" placement="top" arrow={false}>
                    <IconButton
                      aria-label="预览此帧"
                      className="size-[26px]"
                      disabled={frameActionsDisabled}
                      onClick={e => {
                        e.stopPropagation();
                        previewFrame(frame);
                      }}
                    >
                      <Eye size={15} strokeWidth={1.75} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip content="删除此帧" placement="top" arrow={false}>
                    <IconButton
                      aria-label="删除此帧"
                      className="enabled:hover:text-danger size-[26px]"
                      disabled={frameActionsDisabled}
                      onClick={e => {
                        e.stopPropagation();
                        removeFrame(frame.id, index);
                      }}
                    >
                      <Trash2 size={15} strokeWidth={1.75} />
                    </IconButton>
                  </Tooltip>
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* 应答区 */}
      <div className="flex flex-none justify-end gap-2 px-3.5 pb-3.5 pt-2.5">
        <Button variant="secondary" onClick={onCancel} disabled={isAdjustingViewport}>
          取消
        </Button>
        <Button
          variant="primary"
          onClick={saveSequence}
          disabled={frames.length === 0 || isAdjustingViewport}
        >
          {isEditMode ? "更新" : "保存"}
        </Button>
      </div>

      {/* 预览控件：与放映控件同形的底部居中浮动条 */}
      {previewMode &&
        createPortal(
          <ChromeBar className="fixed bottom-[22px] left-1/2 z-[1001] -translate-x-1/2 gap-0.5 text-[12.5px]">
            <ChromeButton
              label="上一帧"
              tooltipPlacement="top"
              onClick={previewPrev}
              disabled={previewIndex === 0}
            >
              <ChevronLeft strokeWidth={1.75} />
            </ChromeButton>
            <span className="text-ink-2 min-w-[56px] text-center tabular-nums">
              <b className="text-ink-1 font-semibold">{previewIndex + 1}</b> / {frames.length}
            </span>
            <ChromeButton
              label="下一帧"
              tooltipPlacement="top"
              onClick={previewNext}
              disabled={previewIndex === frames.length - 1}
            >
              <ChevronRight strokeWidth={1.75} />
            </ChromeButton>
            <ChromeGap />
            <Button variant="ghost" size="sm" icon={X} onClick={stopPreview}>
              退出预览
            </Button>
          </ChromeBar>,
          document.body
        )}

      <ConfirmDialog
        open={removeConfirmOpen}
        onOpenChange={setRemoveConfirmOpen}
        title="删除帧"
        description={
          pendingRemove
            ? `确定要删除第 ${pendingRemove.index + 1} 帧吗？该操作无法撤销。`
            : undefined
        }
        confirmText="删除"
        danger
        onConfirm={confirmRemoveFrame}
      />
    </div>
  );
};

export default PresentationCreator;
