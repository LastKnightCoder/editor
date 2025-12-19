import { memo, useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useMemoizedFn } from "ahooks";
import If from "@/components/If";
import ResizeCircle from "../ResizeCircle";
import ArrowConnectPoint from "../ArrowConnectPoint";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";
import { Music, Play, Pause, Volume2, VolumeX } from "lucide-react";

import { Board, EHandlerPosition, Point, AudioElement } from "../../types";
import { PointUtil } from "../../utils";
import { useBoard, useSelectState, useDropArrow } from "../../hooks";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  SELECT_RECT_FILL_OPACITY,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
  ARROW_CONNECT_POINT_FILL,
  ARROW_CONNECT_POINT_RADIUS,
} from "../../constants";
import { AUDIO_CARD_HEIGHT } from "../../constants/audio";
import useTheme from "@/hooks/useTheme";
import useThemeColors from "@/hooks/useThemeColors";

import styles from "./index.module.less";

interface AudioElementProps {
  element: AudioElement;
  onResizeStart?: (element: AudioElement, startPoint: Point) => void;
  onResize: (
    board: Board,
    element: AudioElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean,
  ) => void;
  onResizeEnd?: (
    board: Board,
    element: AudioElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
  ) => void;
}

// Format time in mm:ss
const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

// Extract filename from path or URL
const getDisplayTitle = (src: string, title?: string): string => {
  if (title) return title;
  try {
    const url = new URL(src, "file://");
    const pathname = url.pathname;
    const filename = pathname.split("/").pop() || "Audio";
    // Remove extension
    return filename.replace(/\.[^/.]+$/, "");
  } catch {
    // Not a valid URL, try to extract filename
    const parts = src.split(/[/\\]/);
    const filename = parts.pop() || "Audio";
    return filename.replace(/\.[^/.]+$/, "");
  }
};

const AudioElementComponent = memo((props: AudioElementProps) => {
  const { element, onResize, onResizeStart, onResizeEnd } = props;

  const { id, x, y, width, src, title, resizable = true } = element;
  const height = AUDIO_CARD_HEIGHT;

  const { isDark } = useTheme();
  const { accentColor } = useThemeColors();
  const board = useBoard();
  const { isSelected } = useSelectState(id);

  // Audio state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const {
    isMoveArrowClosing,
    activeConnectId,
    arrowConnectPoints,
    arrowConnectExtendPoints,
  } = useDropArrow(element);

  // Only show left and right resize handles for audio
  const resizePoints = useMemo(() => {
    const allPoints = PointUtil.getResizePointFromRect({
      x,
      y,
      width,
      height,
    });
    // Filter to only include left and right handles
    return {
      left: allPoints.left,
      right: allPoints.right,
    };
  }, [x, y, width, height]);

  const handleOnResizeStart = useMemoizedFn((startPoint: Point) => {
    onResizeStart?.(element, startPoint);
  });

  const handleOnResize = useMemoizedFn(
    (
      position: EHandlerPosition,
      startPoint: Point,
      endPoint: Point,
      isPreserveRatio?: boolean,
      isAdsorb?: boolean,
    ) => {
      onResize(
        board,
        element,
        position,
        startPoint,
        endPoint,
        isPreserveRatio,
        isAdsorb,
      );
    },
  );

  const handleOnResizeEnd = useMemoizedFn(
    (position: EHandlerPosition, startPoint: Point, endPoint: Point) => {
      onResizeEnd?.(board, element, position, startPoint, endPoint);
    },
  );

  // Audio event handlers
  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current && !isDragging) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, [isDragging]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const togglePlay = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  });

  const toggleMute = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      const newMuted = !isMuted;
      audioRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  });

  const handleVolumeChange = useMemoizedFn(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      const newVolume = parseFloat(e.target.value);
      setVolume(newVolume);
      if (audioRef.current) {
        audioRef.current.volume = newVolume;
        if (newVolume === 0) {
          setIsMuted(true);
          audioRef.current.muted = true;
        } else if (isMuted) {
          setIsMuted(false);
          audioRef.current.muted = false;
        }
      }
    },
  );

  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [isDragging]);

  // Stop all event propagation to prevent selection/drag
  const stopAllPropagation = useMemoizedFn((e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  });

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const displayTitle = getDisplayTitle(src, title);

  return (
    <>
      <foreignObject
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          userSelect: "none",
          overflow: "visible",
        }}
      >
        <div
          className={`${styles.audioCard} ${isDark ? styles.dark : ""}`}
          style={{ width: width, height: height }}
          onDoubleClick={stopAllPropagation}
        >
          {/* Hidden audio element */}
          <audio
            ref={audioRef}
            src={src}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            preload="metadata"
          />

          {/* Left: Play button */}
          <button
            className={styles.playButton}
            onClick={togglePlay}
            onMouseDown={stopAllPropagation}
            onPointerDown={stopAllPropagation}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>

          {/* Center: Title and progress */}
          <div className={styles.content}>
            <div className={styles.titleRow}>
              <Music size={14} className={styles.musicIcon} />
              <span className={styles.title}>{displayTitle}</span>
            </div>

            <div className={styles.progressRow}>
              <span className={styles.time}>{formatTime(currentTime)}</span>
              <input
                type="range"
                min="0"
                max={duration || 1}
                step="0.1"
                value={currentTime}
                onChange={(e) => {
                  const time = parseFloat(e.target.value);
                  setCurrentTime(time);
                  if (audioRef.current) {
                    audioRef.current.currentTime = time;
                  }
                }}
                onMouseDown={stopAllPropagation}
                onPointerDown={stopAllPropagation}
                className={styles.progressSlider}
                style={{
                  background: `linear-gradient(to right, ${accentColor} ${progress}%, ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"} ${progress}%)`,
                  color: accentColor,
                }}
              />
              <span className={styles.time}>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right: Volume control with hover expand */}
          <div
            className={styles.volumeControl}
            onMouseEnter={() => setShowVolumeSlider(true)}
            onMouseLeave={() => setShowVolumeSlider(false)}
          >
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              onMouseDown={stopAllPropagation}
              onPointerDown={stopAllPropagation}
              className={`${styles.volumeSlider} ${showVolumeSlider ? styles.visible : ""}`}
              style={{
                background: `linear-gradient(to right, ${accentColor} ${(isMuted ? 0 : volume) * 100}%, ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"} ${(isMuted ? 0 : volume) * 100}%)`,
                color: accentColor,
              }}
            />
            <button
              className={styles.volumeButton}
              onClick={toggleMute}
              onMouseDown={stopAllPropagation}
              onPointerDown={stopAllPropagation}
            >
              {isMuted || volume === 0 ? (
                <VolumeX size={16} />
              ) : (
                <Volume2 size={16} />
              )}
            </button>
          </div>
        </div>
      </foreignObject>

      <If condition={isSelected}>
        <g>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fillOpacity={SELECT_RECT_FILL_OPACITY}
            stroke={SELECT_RECT_STROKE}
            strokeWidth={SELECT_RECT_STROKE_WIDTH}
            style={{ pointerEvents: "none" }}
          />
          {resizable &&
            Object.entries(resizePoints).map(([position, point]) => (
              <ResizeCircle
                key={position}
                cx={point.x}
                cy={point.y}
                r={RESIZE_CIRCLE_RADIUS}
                fill={RESIZE_CIRCLE_FILL}
                position={position as EHandlerPosition}
                onResizeStart={handleOnResizeStart}
                onResize={handleOnResize}
                onResizeEnd={handleOnResizeEnd}
              />
            ))}
          {arrowConnectExtendPoints.map((point) => (
            <ArrowConnectPoint
              key={point.connectId}
              element={element}
              connectId={point.connectId}
              x={point.point.x}
              y={point.point.y}
              r={ARROW_CONNECT_POINT_RADIUS}
              fill={ARROW_CONNECT_POINT_FILL}
            />
          ))}
        </g>
      </If>
      <If condition={isMoveArrowClosing}>
        {arrowConnectPoints.map((point) => (
          <ArrowDropConnectPoint
            key={point.connectId}
            cx={point.point.x}
            cy={point.point.y}
            isActive={activeConnectId === point.connectId}
          />
        ))}
      </If>
    </>
  );
});

export default AudioElementComponent;
