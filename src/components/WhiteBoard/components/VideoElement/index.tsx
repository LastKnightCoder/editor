import React, { memo, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import If from "@/components/If";
import LocalVideo from "@/components/LocalVideo";
// keep single If import
import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import { useBilibiliVideo } from "@/hooks/useBilibiliVideo";
import { useYoutubeVideo } from "@/hooks/useYoutubeVideo";
import { isBilibiliUrl } from "@/utils/bilibili";
import { isYoutubeUrl } from "@/utils/youtube/parser";
import ResizeCircle from "../ResizeCircle";
import ArrowConnectPoint from "../ArrowConnectPoint";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";

import { Board, EHandlerPosition, Point, VideoElement } from "../../types";
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

interface VideoElementProps {
  element: VideoElement;
  onResizeStart?: (element: VideoElement, startPoint: Point) => void;
  onResize: (
    board: Board,
    element: VideoElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean,
  ) => void;
  onResizeEnd?: (
    board: Board,
    element: VideoElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
  ) => void;
}

const VideoElementComponent = memo((props: VideoElementProps) => {
  const { element, onResize, onResizeStart, onResizeEnd } = props;

  const { id, x, y, width, height, src, metaInfo } = element;
  const isBilibili = useMemo(() => {
    if (!src) return false;
    if (metaInfo && (metaInfo as any).type === "bilibili") return true;
    return isBilibiliUrl(src);
  }, [src, metaInfo]);

  const isYoutube = useMemo(() => {
    if (!src) return false;
    if (metaInfo && (metaInfo as any).type === "youtube") return true;
    return isYoutubeUrl(src);
  }, [src, metaInfo]);

  const {
    videoUrl: bilibiliVideoUrl,
    loading: bilibiliLoading,
    error: bilibiliError,
    streamProgress: bilibiliProgress,
  } = useBilibiliVideo(
    (metaInfo as any)?.type === "bilibili" ? (metaInfo as any) : undefined,
  );

  const {
    videoUrl: youtubeVideoUrl,
    loading: youtubeLoading,
    error: youtubeError,
    streamProgress: youtubeProgress,
  } = useYoutubeVideo(
    (metaInfo as any)?.type === "youtube" ? (metaInfo as any) : undefined,
  );

  const board = useBoard();
  const { isSelected } = useSelectState(id);

  const {
    isMoveArrowClosing,
    activeConnectId,
    arrowConnectPoints,
    arrowConnectExtendPoints,
  } = useDropArrow(element);

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

  return (
    <>
      <foreignObject
        x={x}
        y={y}
        width={"100%"}
        height={"100%"}
        style={{
          width,
          height,
        }}
      >
        {/* 平台视频优先按平台渲染 */}
        <If condition={isBilibili}>
          <>
            <BilibiliVideoLoader
              loading={bilibiliLoading}
              error={bilibiliError}
              streamProgress={bilibiliProgress}
            />
            <If
              condition={
                !!bilibiliVideoUrl && !bilibiliLoading && !bilibiliError
              }
            >
              <LocalVideo
                src={bilibiliVideoUrl as string}
                controls
                style={{ padding: 16, boxSizing: "border-box" }}
                width={"100%"}
                height={"100%"}
              />
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
            <If
              condition={!!youtubeVideoUrl && !youtubeLoading && !youtubeError}
            >
              <LocalVideo
                src={youtubeVideoUrl as string}
                controls
                style={{ padding: 16, boxSizing: "border-box" }}
                width={"100%"}
                height={"100%"}
              />
            </If>
          </>
        </If>
        <If condition={!isBilibili && !isYoutube}>
          <LocalVideo
            src={src}
            controls
            style={{ padding: 16, boxSizing: "border-box" }}
            width={"100%"}
            height={"100%"}
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
            }}
          />
        </If>
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
          {Object.entries(resizePoints).map(([position, point]) => (
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

export default VideoElementComponent;
