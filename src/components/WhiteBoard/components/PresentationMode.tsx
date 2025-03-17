import React, { useState, useRef, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { Flex, Button, Tooltip } from "antd";
import {
  LeftOutlined,
  RightOutlined,
  FullscreenOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { useBoard } from "../hooks/useBoard";
import styles from "./PresentationMode.module.less";
import usePresentationState from "../hooks/usePresentationState";

const PresentationMode: React.FC = () => {
  const [showTip, setShowTip] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const board = useBoard();
  const {
    isPresentationMode,
    isCreatingSequence,
    currentSequence,
    currentFrameIndex,
  } = usePresentationState();

  const totalFrames = currentSequence?.frames.length || 0;

  // 3秒后隐藏提示
  useEffect(() => {
    const tipTimer = setTimeout(() => {
      setShowTip(false);
    }, 3000);

    return () => {
      clearTimeout(tipTimer);
    };
  }, []);

  const handleFullscreen = useMemoizedFn(() => {
    document.documentElement.requestFullscreen();
  });

  const handleNext = useMemoizedFn(() => {
    if (board) {
      console.log("尝试切换到下一帧");
      board.presentationManager.nextFrame();
    }
  });

  const handlePrev = useMemoizedFn(() => {
    if (board) {
      console.log("尝试切换到上一帧");
      board.presentationManager.prevFrame();
    }
  });

  const handleExit = useMemoizedFn(() => {
    if (board) {
      board.presentationManager.stopPresentationMode();
    }
  });

  // 如果不在演示模式，不渲染组件
  if (!isPresentationMode || isCreatingSequence) {
    return null;
  }

  if (!currentSequence) {
    return null;
  }

  return (
    <div ref={containerRef} className={styles.presentationContainer}>
      <div className={styles.presentationFooter}>
        <Flex align="center" gap={12} justify="space-between">
          <LeftOutlined onClick={handlePrev} />
          <span>
            {currentFrameIndex !== null ? currentFrameIndex + 1 : 0} /{" "}
            {totalFrames}
          </span>
          <RightOutlined onClick={handleNext} />
        </Flex>
      </div>

      <div className={styles.presentationControls}>
        <Tooltip title="全屏">
          <Button
            type="text"
            icon={<FullscreenOutlined />}
            onClick={handleFullscreen}
          />
        </Tooltip>
        <Tooltip title="退出演示">
          <Button type="text" icon={<CloseOutlined />} onClick={handleExit} />
        </Tooltip>
      </div>

      {showTip && (
        <div className={styles.tipMessage}>
          使用方向键或滚轮导航，按 ESC 退出演示模式，按 F 全屏
        </div>
      )}
    </div>
  );
};

export default PresentationMode;
