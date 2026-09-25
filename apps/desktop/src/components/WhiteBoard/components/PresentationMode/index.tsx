/**
 * 放映模式外壳（D-049 画布 chrome 换皮）：
 * 底部居中一条 ChromeBar（上一帧 · 页码 · 下一帧 · 激光笔 · 退出），顶部墨底小提示；
 * 激光笔轨迹用 accent。只换外壳，翻页、激光笔轨迹计算、全屏、录制逻辑保持原样。
 */

import React, { useState, useRef, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { Button, cn, toast } from "@tau/ui";
import { ChevronLeft, ChevronRight, Crosshair, X } from "lucide-react";
import { useBoard } from "../../hooks/useBoard";
import { ChromeBar, ChromeButton, ChromeGap } from "../../chrome";
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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
  progress: number
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
    const steps = Math.round(clamp(distance / LASER_SAMPLE_SPACING, 2, LASER_SAMPLE_MAX_STEPS));

    for (let step = 0; step < steps; step += 1) {
      const progress = step / steps;
      samples.push({
        x: getCatmullRomValue(previous.x, current.x, next.x, afterNext.x, progress),
        y: getCatmullRomValue(previous.y, current.y, next.y, afterNext.y, progress),
        createdAt: current.createdAt + (next.createdAt - current.createdAt) * progress,
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
  const alivePoints = points.filter(point => now - point.createdAt < LASER_TRAIL_DURATION);
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
  const headCapX = headLeft.sourceX + headLeft.tangentX * headLeft.radius * LASER_CAP_ROUNDNESS;
  const headCapY = headLeft.sourceY + headLeft.tangentY * headLeft.radius * LASER_CAP_ROUNDNESS;
  const tailCapX = tailLeft.sourceX - tailLeft.tangentX * tailLeft.radius * LASER_CAP_ROUNDNESS;
  const tailCapY = tailLeft.sourceY - tailLeft.tangentY * tailLeft.radius * LASER_CAP_ROUNDNESS;
  const headCurve = [`Q ${headCapX}`, `${headCapY}`, `${headRight.x}`, `${headRight.y}`].join(" ");
  const tailCurve = [`Q ${tailCapX}`, `${tailCapY}`, `${tailLeft.x}`, `${tailLeft.y}`].join(" ");

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
  // 提示淡出阶段（原 CSS：2s 后用 1s 淡出，3s 时移除）
  const [tipFading, setTipFading] = useState(false);
  const [pointerMode, setPointerMode] = useState<PointerMode>("cursor");
  const [laserPoints, setLaserPoints] = useState<LaserPoint[]>([]);
  const didEnterRef = useRef(false);
  const laserPointIdRef = useRef(0);
  const recordingStateRef = useRef<ReturnType<typeof useWhiteboardRecording>["state"] | null>(null);
  const board = useBoard();
  const recordingSetting = useSettingStore(state => state.setting.whiteboardRecording);
  const { isPresentationMode, isCreatingSequence, currentSequence, currentFrameIndex } =
    usePresentationState();

  const totalFrames = currentSequence?.frames.length || 0;
  const recording = useWhiteboardRecording({
    setting: recordingSetting,
    onSaved: outputPath => {
      toast.success(`录制已保存：${outputPath}`);
    },
    onError: errorMessage => {
      toast.error(errorMessage);
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

  // 2 秒后开始淡出，3 秒后隐藏提示
  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setTipFading(true);
    }, 2000);
    const tipTimer = setTimeout(() => {
      setShowTip(false);
    }, 3000);

    return () => {
      clearTimeout(fadeTimer);
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
    setPointerMode(mode => (mode === "laser" ? "cursor" : "laser"));
    setLaserPoints([]);
  });

  const blockLaserBoardInteraction = useMemoizedFn((event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  });

  const handleLaserWheel = useMemoizedFn((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.deltaY > 0) {
      board.presentationManager.nextFrame();
    } else if (event.deltaY < 0) {
      board.presentationManager.prevFrame();
    }
  });

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
      setLaserPoints(points => [
        ...points
          .filter(point => now - point.createdAt < LASER_TRAIL_DURATION)
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
      setLaserPoints(points => {
        const nextPoints = points.filter(point => now - point.createdAt < LASER_TRAIL_DURATION);
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
      const shouldStop = currentStatus === "recording" || currentStatus === "paused";
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

  const displayIndex = currentFrameIndex !== null ? currentFrameIndex + 1 : 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-[1000] overflow-hidden">
      {/* 放映控件：底部居中浮动条 */}
      <ChromeBar className="pointer-events-auto bottom-[22px] left-1/2 z-[1001] -translate-x-1/2 select-none gap-0.5 text-[12.5px]">
        <ChromeButton
          label="上一帧"
          tooltipPlacement="top"
          onClick={handlePrev}
          disabled={displayIndex <= 1}
        >
          <ChevronLeft strokeWidth={1.75} />
        </ChromeButton>
        <span className="text-ink-2 min-w-[56px] text-center tabular-nums">
          <b className="text-ink-1 font-semibold">{displayIndex}</b> / {totalFrames}
        </span>
        <ChromeButton
          label="下一帧"
          tooltipPlacement="top"
          onClick={handleNext}
          disabled={displayIndex >= totalFrames}
        >
          <ChevronRight strokeWidth={1.75} />
        </ChromeButton>
        <ChromeGap />
        <ChromeButton
          label={pointerMode === "laser" ? "切换为普通鼠标" : "切换为激光笔"}
          tooltipPlacement="top"
          active={pointerMode === "laser"}
          onClick={handleTogglePointerMode}
        >
          <Crosshair strokeWidth={1.75} />
        </ChromeButton>
        <Button variant="ghost" size="sm" icon={X} onClick={handleExit}>
          退出
        </Button>
      </ChromeBar>

      {showTip && (
        <div
          className={cn(
            "bg-ink-1 text-ink-inverse shadow-float absolute left-1/2 top-[22px] z-[1001] -translate-x-1/2 whitespace-nowrap rounded-[10px] px-3.5 py-[7px] text-[12.5px]",
            "ease-tau-out transition-opacity duration-1000",
            tipFading && "opacity-0"
          )}
        >
          使用方向键或滚轮导航，按 ESC 退出演示模式
        </div>
      )}

      {pointerMode === "laser" && (
        <div
          className="pointer-events-auto fixed inset-0 z-[1000] cursor-none overflow-hidden"
          onClick={blockLaserBoardInteraction}
          onDoubleClick={blockLaserBoardInteraction}
          onContextMenu={blockLaserBoardInteraction}
          onPointerDown={blockLaserBoardInteraction}
          onPointerUp={blockLaserBoardInteraction}
          onWheel={handleLaserWheel}
        >
          <svg className="pointer-events-none h-full w-full overflow-visible">
            {laserCorePath && (
              <path
                d={laserCorePath}
                opacity={laserOpacity}
                stroke="none"
                fill="var(--tau-accent)"
                style={{ willChange: "opacity" }}
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
