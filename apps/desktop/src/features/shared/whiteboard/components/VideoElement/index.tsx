import { IResourceService } from "@tau/shared/host-services";
import React, { memo, useCallback, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "@tau/ui";
import { StickyNote } from "lucide-react";
import { If } from "@tau/ui";
import LocalVideo from "@/components/LocalVideo";
import OnlineVideoLoader from "@/components/OnlineVideoLoader";
import { useOnlineVideo } from "@/hooks/useOnlineVideo";
import { isOnlineVideoType } from "@/types/online-video";
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
    () => src.startsWith("tau-collab-") || shouldUseLocalVideoCache(src, autoCacheRemoteVideo),
    [src, autoCacheRemoteVideo]
  );
  const onlineMeta = isOnlineVideoType(metaInfo?.type) ? metaInfo : undefined;
  const online = useOnlineVideo(onlineMeta);

  const board = useBoard();
  const { isSelected } = useSelectState(id);
  const sketch = useSketch(element);
  const setVideoRef = useCallback(
    (video: HTMLVideoElement | null) => {
      board.emit("tau.video-note.element-ref", {
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
    board.emit("tau.video-note.open", element);
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
              className="absolute top-5 right-5 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-black/10 bg-white/90 text-gray-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:bg-white hover:text-[var(--tau-accent)] dark:border-white/10 dark:bg-zinc-900/90 dark:text-gray-300 dark:hover:bg-zinc-900"
              style={{ display: isSelected ? "none" : undefined }}
              onClick={handleOpenVideoNote}
              onPointerDown={event => event.stopPropagation()}
              onMouseDown={event => event.stopPropagation()}
            >
              <StickyNote size={16} />
            </button>
          </Tooltip>
          {/* 视频插件提供的视频经插件取源 */}
          <If condition={!!onlineMeta}>
            <>
              <OnlineVideoLoader
                providerId={String(onlineMeta?.type)}
                loading={online.loading}
                error={online.error}
                streamProgress={online.streamProgress}
                onRetry={online.retry}
              />
              <If condition={!!online.videoUrl && !online.loading && !online.error}>
                <LocalVideo ref={setVideoRef} src={online.videoUrl as string} className="h-full" />
              </If>
            </>
          </If>
          <If condition={!onlineMeta}>
            {shouldUseLocalVideo ? (
              <LocalVideo
                ref={setVideoRef}
                src={src}
                resolveResource={board.tryGetService(IResourceService)?.remoteResourceToLocal}
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
