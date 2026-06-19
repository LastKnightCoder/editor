import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";
import { Button, Input, Tooltip, List, Slider, App } from "antd";
import {
  Plus,
  Save,
  X,
  Eye,
  Maximize2,
  Square,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Clapperboard,
  Film,
} from "lucide-react";
import styles from "./index.module.less";
import usePresentationState from "../../hooks/usePresentationState";
import { useBoard } from "../../hooks";
import { ViewPort, PresentationFrame } from "../../types";
import { ViewPortTransforms } from "../../transforms/ViewPortTransforms";
import useTheme from "@/hooks/useTheme";

const PresentationCreator: React.FC = () => {
  const board = useBoard();
  const { message, modal } = App.useApp();
  const { isDark } = useTheme();
  const [frames, setFrames] = useState<PresentationFrame[]>([]);
  const [currentFrame, setCurrentFrame] = useState<PresentationFrame | null>(
    null,
  );
  const { isPresentationMode, isCreatingSequence } = usePresentationState();

  const [sequenceName, setSequenceName] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isAdjustingViewport, setIsAdjustingViewport] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentSequenceId, setCurrentSequenceId] = useState<
    string | undefined
  >(undefined);

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
      const currentSequenceData =
        board.presentationManager.getCurrentSequenceFrames();

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
    const newFrame =
      board.presentationManager.createFrameFromSelectedElements(board);

    if (!newFrame) {
      message.warning("请先选择元素");
      return;
    }

    setFrames((prev) => [...prev, newFrame]);
    setCurrentFrame(newFrame);

    message.success("已添加当前选中元素为一帧");

    board.apply(
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectedElements: [],
          selectArea: null,
        },
      },
      false,
    );
  });

  // 删除一帧
  const removeFrame = useMemoizedFn((frameId: string, index: number) => {
    modal.confirm({
      title: "删除帧",
      content: `确定要删除第 ${index + 1} 帧吗？该操作无法撤销。`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        setFrames((prev) => prev.filter((frame) => frame.id !== frameId));
        if (currentFrame?.id === frameId) {
          setCurrentFrame(null);
        }
      },
    });
  });

  // 预览一帧
  const previewFrame = useMemoizedFn(
    async (frame: PresentationFrame, animate = true) => {
      if (!board) return;

      // 根据帧内元素动态计算视口
      const elementIdSet = new Set(frame.elements);
      const elements = board.presentationManager.getElementsByIds(elementIdSet);
      const computed =
        board.presentationManager.fitElementsInViewport(elements);
      if (!computed) return;

      if (animate) {
        // 使用动画过渡
        await ViewPortTransforms.animateToViewport(
          board,
          board.viewPort,
          computed,
          500,
        );
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
    },
  );

  // 开始预览所有帧
  const startPreview = useMemoizedFn(() => {
    if (frames.length === 0) {
      message.warning("请先添加帧");
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
      message.warning("请先添加帧");
      return;
    }

    if (isEditMode && sequenceName) {
      // 如果是编辑模式且已有名称，直接保存
      handleSave();
    } else {
      // 否则显示保存对话框
      setShowSaveDialog(true);
    }
  });

  // 确认保存
  const handleSave = useMemoizedFn(() => {
    if (!sequenceName.trim()) {
      message.warning("请输入演示序列名称");
      return;
    }

    board.presentationManager.saveSequence(
      sequenceName,
      frames,
      currentSequenceId,
    );
    setShowSaveDialog(false);

    // 保存后自动退出序列制作模式
    board.presentationManager.stopCreatingSequence();
    message.success(
      `演示序列 "${sequenceName}" 已${isEditMode ? "更新" : "保存"}`,
    );
  });

  // 开始调整视口
  const startAdjustViewport = useMemoizedFn(() => {
    if (!currentFrame) {
      message.warning("请先选择一帧");
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
      const newViewport = board.presentationManager.fitElementsInViewport(
        elements,
        value,
      );

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
  }, [
    previewMode,
    previewNext,
    previewPrev,
    stopPreview,
    isAdjustingViewport,
    stopAdjustViewport,
  ]);

  // 清理拖拽事件
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [handleResizeMove, handleResizeEnd]);

  const stopPropagation = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
  });

  if (!isCreatingSequence || isPresentationMode) return null;

  return (
    <div
      className={`${styles.creatorContainer} ${isDark ? styles.dark : ""}`}
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      onMouseDown={stopPropagation}
      onWheel={stopPropagation}
      onDoubleClick={stopPropagation}
    >
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.titleWrap}>
            <Clapperboard size={18} className={styles.titleIcon} />
            <h3 className={styles.title}>
              {isEditMode ? "编辑" : "创建"}演示序列
            </h3>
          </div>
          <Tooltip title="关闭">
            <Button
              type="text"
              icon={<X size={18} />}
              onClick={onCancel}
              disabled={isAdjustingViewport}
              className={styles.closeButton}
            />
          </Tooltip>
        </div>
        <div className={styles.toolbarButtons}>
          <Tooltip title="将选中元素添加为一帧">
            <Button
              icon={<Plus size={16} />}
              onClick={addCurrentFrame}
              disabled={previewMode || isAdjustingViewport}
            >
              添加帧
            </Button>
          </Tooltip>
          <Tooltip
            title={isAdjustingViewport ? "完成视口调整" : "调整当前帧视口"}
          >
            <Button
              icon={
                isAdjustingViewport ? (
                  <Square size={16} />
                ) : (
                  <Maximize2 size={16} />
                )
              }
              onClick={
                isAdjustingViewport ? stopAdjustViewport : startAdjustViewport
              }
              disabled={!currentFrame || previewMode}
            >
              {isAdjustingViewport ? "完成" : "调整视口"}
            </Button>
          </Tooltip>
          <Tooltip title="预览演示序列">
            <Button
              icon={<Eye size={16} />}
              onClick={startPreview}
              disabled={
                frames.length === 0 || previewMode || isAdjustingViewport
              }
            >
              预览
            </Button>
          </Tooltip>
        </div>
      </div>

      {previewMode &&
        createPortal(
          <div className={styles.previewControls}>
            <Button
              type="text"
              icon={<ChevronLeft size={20} />}
              onClick={previewPrev}
              disabled={previewIndex === 0}
              className={styles.previewBtn}
            />
            <span className={styles.previewCounter}>
              {previewIndex + 1} / {frames.length}
            </span>
            <Button
              type="text"
              icon={<ChevronRight size={20} />}
              onClick={previewNext}
              disabled={previewIndex === frames.length - 1}
              className={styles.previewBtn}
            />
            <div className={styles.previewDivider} />
            <Button
              type="text"
              icon={<X size={18} />}
              onClick={stopPreview}
              className={styles.previewBtn}
            >
              退出预览
            </Button>
          </div>,
          document.body,
        )}

      {isAdjustingViewport && (
        <div className={styles.viewportControls}>
          <div className={styles.paddingControl}>
            <span className={styles.paddingLabel}>视口填充</span>
            <Slider
              min={0}
              max={200}
              value={viewportPadding}
              onChange={handlePaddingChange}
              className={styles.paddingSlider}
            />
            <span className={styles.paddingValue}>{viewportPadding}px</span>
          </div>
          <div
            className={styles.resizeHandle}
            ref={resizeHandleRef}
            onMouseDown={handleResizeStart}
          >
            拖拽此处调整视口大小
          </div>
        </div>
      )}

      <div className={styles.framesList}>
        <List
          dataSource={frames}
          size="small"
          bordered={false}
          split={false}
          locale={{
            emptyText: (
              <div className={styles.emptyState}>
                <Film size={28} className={styles.emptyIcon} />
                <p className={styles.emptyTitle}>暂无帧</p>
                <span className={styles.emptyHint}>
                  选中画板元素后点击「添加帧」
                </span>
              </div>
            ),
          }}
          renderItem={(frame, index) => (
            <List.Item
              className={`${styles.frameItem} ${currentFrame?.id === frame.id ? styles.activeFrame : ""}`}
              actions={[
                <Tooltip key="preview" title="预览此帧">
                  <Button
                    type="text"
                    icon={<Eye size={15} />}
                    onClick={() => previewFrame(frame)}
                    disabled={previewMode || isAdjustingViewport}
                    className={styles.frameActionButton}
                  />
                </Tooltip>,
                <Tooltip key="delete" title="删除此帧">
                  <Button
                    type="text"
                    icon={<Trash2 size={15} />}
                    onClick={() => removeFrame(frame.id, index)}
                    disabled={previewMode || isAdjustingViewport}
                    className={`${styles.frameActionButton} ${styles.deleteButton}`}
                  />
                </Tooltip>,
              ]}
            >
              <div
                className={styles.frameContent}
                onClick={() => previewFrame(frame, false)}
              >
                <span className={styles.frameIndex}>{index + 1}</span>
                <div className={styles.frameInfo}>
                  <span className={styles.frameLabel}>帧 {index + 1}</span>
                  <span className={styles.frameMeta}>
                    {frame.elements.length} 个元素
                  </span>
                </div>
              </div>
            </List.Item>
          )}
        />
      </div>

      <div className={styles.footer}>
        <Button
          onClick={onCancel}
          disabled={isAdjustingViewport}
          className={styles.cancelButton}
        >
          取消
        </Button>
        <Button
          type="primary"
          icon={<Save size={16} />}
          onClick={saveSequence}
          disabled={frames.length === 0 || isAdjustingViewport}
          className={styles.saveButton}
        >
          保存序列
        </Button>
      </div>

      {showSaveDialog &&
        createPortal(
          <div className={styles.saveDialogOverlay}>
            <div className={styles.saveDialog}>
              <h3 className={styles.saveDialogTitle}>
                {isEditMode ? "更新" : "保存"}演示序列
              </h3>
              <p className={styles.saveDialogSubtitle}>
                为此演示序列命名，共 {frames.length} 帧
              </p>
              <Input
                placeholder="请输入演示序列名称"
                value={sequenceName}
                onChange={(e) => setSequenceName(e.target.value)}
                onPressEnter={handleSave}
                autoFocus
                className={styles.saveDialogInput}
              />
              <div className={styles.saveDialogButtons}>
                <Button onClick={() => setShowSaveDialog(false)}>取消</Button>
                <Button type="primary" onClick={handleSave}>
                  {isEditMode ? "更新" : "保存"}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default PresentationCreator;
