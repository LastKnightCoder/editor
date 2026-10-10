import React, { memo, useCallback, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "@tau/ui";
import { StickyNote } from "lucide-react";
import { If } from "@tau/ui";
import LocalVideo from "@/components/LocalVideo";
// keep single If import
import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import { useBilibiliVideo } from "@/hooks/useBilibiliVideo";
import { useYoutubeVideo } from "@/hooks/useYoutubeVideo";
import { isBilibiliUrl } from "@/utils/bilibili";
import { isYoutubeUrl } from "@/utils/youtube/parser";
import { ResizeCircle as ResizeCircle } from "@tau/whiteboard";
import { ArrowConnectPointGroup as ArrowConnectPointGroup } from "@tau/whiteboard";
import { ArrowDropConnectPoint as ArrowDropConnectPoint } from "@tau/whiteboard";
import { SketchRect as SketchRect } from "@tau/whiteboard";

import { EHandlerPosition, Point, VideoElement } from "@tau/whiteboard";
import { PointUtil } from "@tau/whiteboard";
import { useBoard, useSelectState, useDropArrow, useSketch } from "@tau/whiteboard";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  SELECT_RECT_FILL_OPACITY,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
  SKETCH_MEDIA_FRAME,
} from "@tau/whiteboard";
import useSettingStore from "@/stores/useSettingStore";
import { shouldUseLocalVideoCache } from "@/utils/video";

interface VideoElementProps {
  element: VideoElement;
  onResizeStart?: (element: VideoElement, startPoint: Point) => void;
  onResize: (
    element: VideoElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean
  ) => void;
  onResizeEnd?: (
    element: VideoElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point
  ) => void;
}

const VideoElementComponent = memo((props: VideoElementProps) => {
  const { element, onResize, onResizeStart, onResizeEnd } = props;

  const { id, x, y, width, height, src, metaInfo, resizable = true } = element;
  const autoCacheRemoteVideo = useSettingStore(state => state.setting.misc.video.autoCacheRemote);
  const shouldUseLocalVideo = useMemo(
    () => shouldUseLocalVideoCache(src, autoCacheRemoteVideo),
    [src, autoCacheRemoteVideo]
  );
  const isBilibili = useMemo(() => {
    if (!src) return false;
    if (metaInfo && "type" in metaInfo && metaInfo.type === "bilibili") return true;
    return isBilibiliUrl(src);
  }, [src, metaInfo]);

  const isYoutube = useMemo(() => {
    if (!src) return false;
    if (metaInfo && "type" in metaInfo && metaInfo.type === "youtube") return true;
    return isYoutubeUrl(src);
  }, [src, metaInfo]);

  const biliMeta =
    metaInfo && "type" in metaInfo && metaInfo.type === "bilibili" ? metaInfo : undefined;
  const ytMeta =
    metaInfo && "type" in metaInfo && metaInfo.type === "youtube" ? metaInfo : undefined;
  const {
    videoUrl: bilibiliVideoUrl,
    loading: bilibiliLoading,
    error: bilibiliError,
    streamProgress: bilibiliProgress,
  } = useBilibiliVideo(biliMeta);

  const {
    videoUrl: youtubeVideoUrl,
    loading: youtubeLoading,
    error: youtubeError,
    streamProgress: youtubeProgress,
  } = useYoutubeVideo(ytMeta);

  const board = useBoard();
  const { isSelected } = useSelectState(id);
  const sketch = useSketch(element);
  const setVideoRef = useCallback(
    (video: HTMLVideoElement | null) => {
      board.emit("video-note:element-ref", {
        elementId: id,
        video,
      });
    },
    [board, id]
  );

  const { isMoveArrowClosing, activeConnectId, arrowConnectPoints, arrowConnectExtendPoints } =
    useDropArrow(element);

  const [resizePoints] = useMemo(() => {
    const resizePoints = PointUtil.getResizePointFromRect({
      x,
      y,
      width,
      height,
    });

    return [resizePoints];
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
      isAdsorb?: boolean
    ) => {
      onResize(element, position, startPoint, endPoint, isPreserveRatio, isAdsorb);
    }
  );

  const handleOnResizeEnd = useMemoizedFn(
    (position: EHandlerPosition, startPoint: Point, endPoint: Point) => {
      onResizeEnd?.(element, position, startPoint, endPoint);
    }
  );

  const handleOpenVideoNote = useMemoizedFn((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    board.emit("video-note:open", element);
  });

  return (
    <>
      <foreignObject
        x={x}
        y={y}
        width={"100%"}
        height={"100%"}
        className="border-none"
        style={{
          width,
          height,
        }}
      >
        <div
          className="group relative box-border h-full w-full p-4"
          data-whiteboard-stop-keyboard="true"
        >
          <Tooltip content="视频笔记">
            <button
              type="button"
              className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-black/10 bg-white/90 text-gray-600 opacity-0 shadow-sm transition-opacity hover:bg-white hover:text-[var(--tau-accent)] group-hover:opacity-100 dark:border-white/10 dark:bg-zinc-900/90 dark:text-gray-300 dark:hover:bg-zinc-900"
              style={{ display: isSelected ? "none" : undefined }}
              onClick={handleOpenVideoNote}
              onPointerDown={event => event.stopPropagation()}
              onMouseDown={event => event.stopPropagation()}
            >
              <StickyNote size={16} />
            </button>
          </Tooltip>
          {/* 平台视频优先按平台渲染 */}
          <If condition={isBilibili}>
            <>
              <BilibiliVideoLoader
                loading={bilibiliLoading}
                error={bilibiliError}
                streamProgress={bilibiliProgress}
              />
              <If condition={!!bilibiliVideoUrl && !bilibiliLoading && !bilibiliError}>
                <LocalVideo ref={setVideoRef} src={bilibiliVideoUrl as string} className="h-full" />
              </If>
            </>
          </If>
          <If condition={isYoutube}>
            <>
              <YoutubeVideoLoader
                loading={youtubeLoading}
                error={youtubeError}
                streamProgress={youtubeProgress}
              />
              <If condition={!!youtubeVideoUrl && !youtubeLoading && !youtubeError}>
                <LocalVideo ref={setVideoRef} src={youtubeVideoUrl as string} className="h-full" />
              </If>
            </>
          </If>
          <If condition={!isBilibili && !isYoutube}>
            {shouldUseLocalVideo ? (
              <LocalVideo
                ref={setVideoRef}
                src={src}
                className="h-full"
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                }}
              />
            ) : (
              <video
                ref={setVideoRef}
                src={src}
                controls
                style={{ display: "block" }}
                width={"100%"}
                height={"100%"}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                }}
              />
            )}
          </If>
        </div>
      </foreignObject>
      {sketch.enabled && (
        <SketchRect
          x={x}
          y={y}
          width={width}
          height={height}
          radius={8}
          stroke={SKETCH_MEDIA_FRAME}
          strokeWidth={1.5}
          level={sketch.level}
          seed={sketch.seed}
        />
      )}
      <If condition={isSelected}>
        <foreignObject
          x={x + width - 44}
          y={y + 12}
          width={32}
          height={32}
          className="overflow-visible"
        >
          <Tooltip content="视频笔记">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-black/10 bg-white text-gray-600 shadow-sm transition-colors hover:text-[var(--tau-accent)] dark:border-white/10 dark:bg-zinc-900 dark:text-gray-300"
              onClick={handleOpenVideoNote}
              onPointerDown={event => event.stopPropagation()}
              onMouseDown={event => event.stopPropagation()}
            >
              <StickyNote size={16} />
            </button>
          </Tooltip>
        </foreignObject>
      </If>
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
        </g>
      </If>
      <ArrowConnectPointGroup
        element={element}
        points={arrowConnectExtendPoints}
        isSelected={isSelected}
        disabled={isMoveArrowClosing}
      />
      <If condition={isMoveArrowClosing}>
        {arrowConnectPoints.map(point => (
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

export default VideoElementComponent;
