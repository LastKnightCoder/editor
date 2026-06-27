import React, { useState, useRef, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { App, Flex, Button, Tooltip } from "antd";
import {
  LeftOutlined,
  RightOutlined,
  CloseOutlined,
  AimOutlined,
} from "@ant-design/icons";
import { useBoard } from "../../hooks/useBoard";
import styles from "./index.module.less";
import usePresentationState from "../../hooks/usePresentationState";
import useSettingStore from "@/stores/useSettingStore";
import { useWhiteboardRecording } from "../../hooks/useWhiteboardRecording";
import CameraOverlay from "../CameraOverlay";
import { BOARD_TO_CONTAINER } from "../../constants";

type PointerMode = "cursor" | "laser";

type LaserPoint = {
  id: number;
  x: number;
  y: number;
  createdAt: number;
};

const LASER_TRAIL_DURATION = 900;
const LASER_TRAIL_LENGTH = 36;
const LASER_TRAIL_MIN_WIDTH = 1.6;
const LASER_TRAIL_MAX_WIDTH = 10.5;
const LASER_CAP_ROUNDNESS = 0.95;
const LASER_SAMPLE_SPACING = 8;
const LASER_SAMPLE_MAX_STEPS = 12;

type LaserPathPoint = {
  x: number;
  y: number;
};

type LaserSample = LaserPathPoint & {
  createdAt: number;
};

type LaserEdgePoint = LaserPathPoint & {
  sourceX: number;
  sourceY: number;
  tangentX: number;
  tangentY: number;
  radius: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const getLaserLife = (point: LaserSample, now: number) =>
  clamp(1 - (now - point.createdAt) / LASER_TRAIL_DURATION, 0, 1);

const getLaserWidth = (life: number) =>
  LASER_TRAIL_MIN_WIDTH + Math.pow(life, 1.8) * LASER_TRAIL_MAX_WIDTH;

const getDistance = (start: LaserPathPoint, end: LaserPathPoint) =>
  Math.hypot(end.x - start.x, end.y - start.y);

const getCatmullRomValue = (
  previous: number,
  current: number,
  next: number,
  afterNext: number,
  progress: number,
) => {
  const squaredProgress = progress * progress;
  const cubedProgress = squaredProgress * progress;
  return (
    0.5 *
    (2 * current +
      (next - previous) * progress +
      (2 * previous - 5 * current + 4 * next - afterNext) * squaredProgress +
      (-previous + 3 * current - 3 * next + afterNext) * cubedProgress)
  );
};

const getSmoothLaserSamples = (points: LaserPoint[]): LaserSample[] => {
  if (points.length < 2) return points;

  const samples: LaserSample[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(index - 1, 0)];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[Math.min(index + 2, points.length - 1)];
    const distance = getDistance(current, next);
    const steps = Math.round(
      clamp(distance / LASER_SAMPLE_SPACING, 2, LASER_SAMPLE_MAX_STEPS),
    );

    for (let step = 0; step < steps; step += 1) {
      const progress = step / steps;
      samples.push({
        x: getCatmullRomValue(
          previous.x,
          current.x,
          next.x,
          afterNext.x,
          progress,
        ),
        y: getCatmullRomValue(
          previous.y,
          current.y,
          next.y,
          afterNext.y,
          progress,
        ),
        createdAt:
          current.createdAt + (next.createdAt - current.createdAt) * progress,
      });
    }
  }

  const lastPoint = points[points.length - 1];
  samples.push(lastPoint);
  return samples;
};

const buildSmoothLinePath = (points: LaserPathPoint[]) => {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    commands.push(`Q ${current.x} ${current.y} ${midX} ${midY}`);
  }

  const last = points[points.length - 1];
  commands.push(`L ${last.x} ${last.y}`);
  return commands.join(" ");
};

const buildLaserRibbonPath = (points: LaserPoint[], now: number) => {
  const alivePoints = points.filter(
    (point) => now - point.createdAt < LASER_TRAIL_DURATION,
  );
  const smoothPoints = getSmoothLaserSamples(alivePoints);

  if (smoothPoints.length < 2) return "";

  const leftPoints: LaserEdgePoint[] = [];
  const rightPoints: LaserEdgePoint[] = [];

  smoothPoints.forEach((point, index) => {
    const previous = smoothPoints[Math.max(index - 1, 0)];
    const next = smoothPoints[Math.min(index + 1, smoothPoints.length - 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const life = getLaserLife(point, now);
    const halfWidth = getLaserWidth(life) / 2;

    leftPoints.push({
      x: point.x + normalX * halfWidth,
      y: point.y + normalY * halfWidth,
      sourceX: point.x,
      sourceY: point.y,
      tangentX: dx / length,
      tangentY: dy / length,
      radius: halfWidth,
    });
    rightPoints.push({
      x: point.x - normalX * halfWidth,
      y: point.y - normalY * halfWidth,
      sourceX: point.x,
      sourceY: point.y,
      tangentX: dx / length,
      tangentY: dy / length,
      radius: halfWidth,
    });
  });

  const leftPath = buildSmoothLinePath(leftPoints);
  const rightPath = buildSmoothLinePath([...rightPoints].reverse());
  const headLeft = leftPoints[leftPoints.length - 1];
  const headRight = rightPoints[rightPoints.length - 1];
  const tailLeft = leftPoints[0];
  const headCapX =
    headLeft.sourceX +
    headLeft.tangentX * headLeft.radius * LASER_CAP_ROUNDNESS;
  const headCapY =
    headLeft.sourceY +
    headLeft.tangentY * headLeft.radius * LASER_CAP_ROUNDNESS;
  const tailCapX =
    tailLeft.sourceX -
    tailLeft.tangentX * tailLeft.radius * LASER_CAP_ROUNDNESS;
  const tailCapY =
    tailLeft.sourceY -
    tailLeft.tangentY * tailLeft.radius * LASER_CAP_ROUNDNESS;
  const headCurve = [
    `Q ${headCapX}`,
    `${headCapY}`,
    `${headRight.x}`,
    `${headRight.y}`,
  ].join(" ");
  const tailCurve = [
    `Q ${tailCapX}`,
    `${tailCapY}`,
    `${tailLeft.x}`,
    `${tailLeft.y}`,
  ].join(" ");

  return `${leftPath} ${headCurve} ${rightPath.replace(/^M/, "L")} ${tailCurve} Z`;
};

const getLaserOpacity = (points: LaserPoint[], now: number) => {
  const newestPoint = points[points.length - 1];
  if (!newestPoint) return 0;
  const life = getLaserLife(newestPoint, now);
  return clamp(0.12 + Math.pow(life, 1.4) * 0.88, 0, 1);
};

const PresentationMode: React.FC = () => {
  const [showTip, setShowTip] = useState(true);
  const [pointerMode, setPointerMode] = useState<PointerMode>("cursor");
  const [laserPoints, setLaserPoints] = useState<LaserPoint[]>([]);
  const didEnterRef = useRef(false);
  const laserPointIdRef = useRef(0);
  const recordingStateRef = useRef<
    ReturnType<typeof useWhiteboardRecording>["state"] | null
  >(null);
  const board = useBoard();
  const { message } = App.useApp();
  const recordingSetting = useSettingStore(
    (state) => state.setting.whiteboardRecording,
  );
  const {
    isPresentationMode,
    isCreatingSequence,
    currentSequence,
    currentFrameIndex,
  } = usePresentationState();

  const totalFrames = currentSequence?.frames.length || 0;
  const recording = useWhiteboardRecording({
    setting: recordingSetting,
    onSaved: (outputPath) => {
      message.success(`录制已保存：${outputPath}`);
    },
    onError: (errorMessage) => {
      message.error(errorMessage);
    },
  });
  const {
    cameraOverlay,
    closeControls,
    openControls,
    releaseMedia,
    startRecording,
    state: recordingState,
    stopRecording,
  } = recording;

  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  // 3秒后隐藏提示
  useEffect(() => {
    const tipTimer = setTimeout(() => {
      setShowTip(false);
    }, 3000);

    return () => {
      clearTimeout(tipTimer);
    };
  }, []);

  const handleFullscreen = useMemoizedFn(async () => {
    if (document.fullscreenElement) {
      return;
    }
    const fullscreenTarget = BOARD_TO_CONTAINER.get(board);
    await fullscreenTarget?.requestFullscreen().catch(() => undefined);
  });

  const handleTogglePointerMode = useMemoizedFn(() => {
    setPointerMode((mode) => (mode === "laser" ? "cursor" : "laser"));
    setLaserPoints([]);
  });

  const blockLaserBoardInteraction = useMemoizedFn(
    (event: React.SyntheticEvent) => {
      event.preventDefault();
      event.stopPropagation();
    },
  );

  const handleLaserWheel = useMemoizedFn(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY > 0) {
        board.presentationManager.nextFrame();
      } else if (event.deltaY < 0) {
        board.presentationManager.prevFrame();
      }
    },
  );

  const handleNext = useMemoizedFn(() => {
    if (board) {
      board.presentationManager.nextFrame();
    }
  });

  const handlePrev = useMemoizedFn(() => {
    if (board) {
      board.presentationManager.prevFrame();
    }
  });

  const handleExit = useMemoizedFn(async () => {
    const currentStatus = recordingStateRef.current?.status;
    if (currentStatus === "recording" || currentStatus === "paused") {
      await stopRecording();
    }
    releaseMedia();
    await closeControls();
    if (board) {
      board.presentationManager.stopPresentationMode();
    }
  });

  useEffect(() => {
    const fullscreenTarget = BOARD_TO_CONTAINER.get(board);
    if (!isPresentationMode || pointerMode !== "laser" || !fullscreenTarget) {
      setLaserPoints([]);
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const now = Date.now();
      const nextPoint = {
        id: laserPointIdRef.current++,
        x: event.clientX,
        y: event.clientY,
        createdAt: now,
      };
      setLaserPoints((points) => [
        ...points
          .filter((point) => now - point.createdAt < LASER_TRAIL_DURATION)
          .slice(-(LASER_TRAIL_LENGTH - 1)),
        nextPoint,
      ]);
    };

    const handlePointerLeave = () => {
      setLaserPoints([]);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("blur", handlePointerLeave);
    document.addEventListener("pointerleave", handlePointerLeave);

    let animationFrame = 0;
    const removeExpiredPoints = () => {
      const now = Date.now();
      setLaserPoints((points) => {
        const nextPoints = points.filter(
          (point) => now - point.createdAt < LASER_TRAIL_DURATION,
        );
        if (nextPoints.length === 0 && points.length === 0) {
          return points;
        }
        return nextPoints;
      });
      animationFrame = window.requestAnimationFrame(removeExpiredPoints);
    };
    animationFrame = window.requestAnimationFrame(removeExpiredPoints);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", handlePointerLeave);
      document.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [board, isPresentationMode, pointerMode]);

  useEffect(() => {
    if (isPresentationMode) return;
    setPointerMode("cursor");
    setLaserPoints([]);
  }, [isPresentationMode]);

  useEffect(() => {
    if (!isPresentationMode || isCreatingSequence || !currentSequence) {
      return;
    }
    if (didEnterRef.current) {
      return;
    }
    didEnterRef.current = true;
    handleFullscreen();
    openControls();
    if (recordingSetting.autoStartRecording) {
      window.setTimeout(() => {
        startRecording();
      }, 350);
    }

    return () => {
      didEnterRef.current = false;
      const currentStatus = recordingStateRef.current?.status;
      const shouldStop =
        currentStatus === "recording" || currentStatus === "paused";
      if (shouldStop) {
        stopRecording();
      }
      releaseMedia();
      closeControls();
      const fullscreenTarget = BOARD_TO_CONTAINER.get(board);
      if (document.fullscreenElement === fullscreenTarget) {
        document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [
    currentSequence,
    closeControls,
    handleFullscreen,
    isCreatingSequence,
    isPresentationMode,
    openControls,
    releaseMedia,
    recordingSetting.autoStartRecording,
    startRecording,
    stopRecording,
  ]);

  // 如果不在演示模式，不渲染组件
  if (!isPresentationMode || isCreatingSequence) {
    return null;
  }

  if (!currentSequence) {
    return null;
  }

  const laserNow = Date.now();
  const laserCorePath = buildLaserRibbonPath(laserPoints, laserNow);
  const laserOpacity = getLaserOpacity(laserPoints, laserNow);

  return (
    <div className={styles.presentationContainer}>
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
        <Tooltip
          title={pointerMode === "laser" ? "切换为普通鼠标" : "切换为激光笔"}
        >
          <Button
            type="text"
            className={pointerMode === "laser" ? styles.activeTool : undefined}
            icon={<AimOutlined />}
            onClick={handleTogglePointerMode}
          />
        </Tooltip>
        <Tooltip title="退出演示">
          <Button type="text" icon={<CloseOutlined />} onClick={handleExit} />
        </Tooltip>
      </div>

      {showTip && (
        <div className={styles.tipMessage}>
          使用方向键或滚轮导航，按 ESC 退出演示模式
        </div>
      )}

      {pointerMode === "laser" && (
        <div
          className={styles.laserLayer}
          onClick={blockLaserBoardInteraction}
          onDoubleClick={blockLaserBoardInteraction}
          onContextMenu={blockLaserBoardInteraction}
          onPointerDown={blockLaserBoardInteraction}
          onPointerUp={blockLaserBoardInteraction}
          onWheel={handleLaserWheel}
        >
          <svg className={styles.laserSvg}>
            {laserCorePath && (
              <path
                className={styles.laserCore}
                d={laserCorePath}
                opacity={laserOpacity}
              />
            )}
          </svg>
        </div>
      )}

      {cameraOverlay && <CameraOverlay camera={cameraOverlay} />}
    </div>
  );
};

export default PresentationMode;
