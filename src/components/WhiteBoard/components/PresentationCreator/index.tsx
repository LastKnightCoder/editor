import React, { useState, useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import {
  Button,
  Input,
  Tooltip,
  List,
  Slider,
  App,
  Space,
  Divider,
} from "antd";
import {
  PlusOutlined,
  SaveOutlined,
  CloseOutlined,
  EyeOutlined,
  FullscreenOutlined,
  BorderOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import type { PresentationFrame } from "../../utils/PresentationManager";
import styles from "./index.module.less";
import usePresentationState from "../../hooks/usePresentationState";
import { useBoard } from "../../hooks";
import { ViewPort } from "../../types";
import { ViewPortTransforms } from "../../transforms/ViewPortTransforms";

const PresentationCreator: React.FC = () => {
  const board = useBoard();
  const { message } = App.useApp();
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
  const removeFrame = useMemoizedFn((frameId: string) => {
    setFrames((prev) => prev.filter((frame) => frame.id !== frameId));
    if (currentFrame?.id === frameId) {
      setCurrentFrame(null);
    }
  });

  // 预览一帧
  const previewFrame = useMemoizedFn(
    async (frame: PresentationFrame, animate = true) => {
      if (!board) return;

      if (animate) {
        // 使用动画过渡
        await ViewPortTransforms.animateToViewport(
          board,
          board.viewPort,
          frame.viewPort,
          500,
        );
      } else {
        // 直接更新视口
        board.apply({
          type: "set_viewport",
          properties: board.viewPort,
          newProperties: frame.viewPort,
        });
      }

      setCurrentFrame(frame);

      // 更新当前视口引用
      currentViewportRef.current = { ...frame.viewPort };
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

    // 保存当前视口状态
    currentViewportRef.current = { ...currentFrame.viewPort };
  });

  // 停止调整视口
  const stopAdjustViewport = useMemoizedFn(() => {
    setIsAdjustingViewport(false);

    // 如果有调整，更新当前帧
    if (currentFrame && currentViewportRef.current) {
      const updatedFrame = {
        ...currentFrame,
        viewPort: { ...currentViewportRef.current },
      };

      // 更新帧列表
      setFrames((prev) =>
        prev.map((frame) =>
          frame.id === currentFrame.id ? updatedFrame : frame,
        ),
      );

      // 更新当前帧
      setCurrentFrame(updatedFrame);

      message.success("视口已更新");
    }
  });

  // 调整视口填充
  const handlePaddingChange = useMemoizedFn((value: number) => {
    setViewportPadding(value);

    if (currentFrame && board) {
      // 获取当前选中的元素
      const selectedElements = board.selection.selectedElements;

      if (selectedElements.length > 0) {
        // 使用presentationManager的方法来计算合适的视口
        const newViewport = board.presentationManager.fitElementsInViewport(
          selectedElements,
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

          // 更新当前帧
          const updatedFrame = {
            ...currentFrame,
            viewPort: { ...newViewport },
          };

          // 更新帧列表
          setFrames((prev) =>
            prev.map((frame) =>
              frame.id === currentFrame.id ? updatedFrame : frame,
            ),
          );

          // 更新当前帧
          setCurrentFrame(updatedFrame);
        }
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

    // 如果有当前帧和视口，更新帧
    if (currentFrame && currentViewportRef.current) {
      const updatedFrame = {
        ...currentFrame,
        viewPort: { ...currentViewportRef.current },
      };

      // 更新帧列表
      setFrames((prev) =>
        prev.map((frame) =>
          frame.id === currentFrame.id ? updatedFrame : frame,
        ),
      );

      // 更新当前帧
      setCurrentFrame(updatedFrame);
    }
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
      className={styles.creatorContainer}
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      onMouseDown={stopPropagation}
      onWheel={stopPropagation}
      onDoubleClick={stopPropagation}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>{isEditMode ? "编辑" : "创建"}演示序列</h3>
        <Divider className={styles.divider} />
        <div className={styles.actionButtons}>
          <Space size="middle">
            <Tooltip title="添加帧">
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={addCurrentFrame}
                disabled={previewMode || isAdjustingViewport}
              >
                添加帧
              </Button>
            </Tooltip>
            <Tooltip title={isAdjustingViewport ? "完成调整" : "调整视口"}>
              <Button
                icon={
                  isAdjustingViewport ? (
                    <BorderOutlined />
                  ) : (
                    <FullscreenOutlined />
                  )
                }
                onClick={
                  isAdjustingViewport ? stopAdjustViewport : startAdjustViewport
                }
                disabled={!currentFrame || previewMode}
              >
                {isAdjustingViewport ? "完成调整" : "调整视口"}
              </Button>
            </Tooltip>
            <Tooltip title="预览">
              <Button
                icon={<EyeOutlined />}
                onClick={startPreview}
                disabled={
                  frames.length === 0 || previewMode || isAdjustingViewport
                }
              >
                预览
              </Button>
            </Tooltip>
            <Tooltip title="保存">
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={saveSequence}
                disabled={frames.length === 0 || isAdjustingViewport}
              >
                保存
              </Button>
            </Tooltip>
            <Tooltip title="取消">
              <Button
                danger
                icon={<CloseOutlined />}
                onClick={onCancel}
                disabled={isAdjustingViewport}
              >
                取消
              </Button>
            </Tooltip>
          </Space>
        </div>
      </div>

      {previewMode && (
        <div className={styles.previewControls}>
          <Button
            type="primary"
            icon={<LeftOutlined />}
            onClick={previewPrev}
            disabled={previewIndex === 0}
          />
          <span className={styles.previewCounter}>
            {previewIndex + 1} / {frames.length}
          </span>
          <Button
            type="primary"
            icon={<RightOutlined />}
            onClick={previewNext}
            disabled={previewIndex === frames.length - 1}
          />
          <Button
            type="primary"
            danger
            icon={<CloseOutlined />}
            onClick={stopPreview}
          >
            退出预览
          </Button>
        </div>
      )}

      {isAdjustingViewport && (
        <div className={styles.viewportControls}>
          <div className={styles.paddingControl}>
            <span>视口填充:</span>
            <Slider
              min={0}
              max={200}
              value={viewportPadding}
              onChange={handlePaddingChange}
              style={{ width: 200 }}
            />
            <span>{viewportPadding}px</span>
          </div>
          <div
            className={styles.resizeHandle}
            ref={resizeHandleRef}
            onMouseDown={handleResizeStart}
          >
            拖拽调整视口大小
          </div>
        </div>
      )}

      <div className={styles.framesList}>
        <List
          dataSource={frames}
          size="small"
          bordered={false}
          locale={{ emptyText: "暂无帧，请点击添加帧按钮添加" }}
          renderItem={(frame, index) => (
            <List.Item
              className={`${styles.frameItem} ${currentFrame?.id === frame.id ? styles.activeFrame : ""}`}
              actions={[
                <Tooltip key="preview" title="预览">
                  <Button
                    type="primary"
                    ghost
                    icon={<EyeOutlined />}
                    onClick={() => previewFrame(frame)}
                    disabled={previewMode || isAdjustingViewport}
                  />
                </Tooltip>,
                <Tooltip key="delete" title="删除">
                  <Button
                    type="primary"
                    danger
                    ghost
                    icon={<CloseOutlined />}
                    onClick={() => removeFrame(frame.id)}
                    disabled={previewMode || isAdjustingViewport}
                  />
                </Tooltip>,
              ]}
            >
              <div onClick={() => previewFrame(frame, false)}>
                帧 {index + 1} ({frame.elements.length}个元素)
              </div>
            </List.Item>
          )}
        />
      </div>

      {showSaveDialog && (
        <div className={styles.saveDialogOverlay}>
          <div className={styles.saveDialog}>
            <h3>{isEditMode ? "更新" : "保存"}演示序列</h3>
            <Input
              placeholder="请输入演示序列名称"
              value={sequenceName}
              onChange={(e) => setSequenceName(e.target.value)}
              autoFocus
            />
            <div className={styles.saveDialogButtons}>
              <Button size="large" onClick={() => setShowSaveDialog(false)}>
                取消
              </Button>
              <Button size="large" type="primary" onClick={handleSave}>
                {isEditMode ? "更新" : "保存"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PresentationCreator;
