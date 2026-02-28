import React, { memo, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import If from "@/components/If";
import LocalVideo from "@/components/LocalVideo";
// keep single If import
import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import NotionVideoLoader from "@/components/NotionVideoLoader";
import { useBilibiliVideo } from "@/hooks/useBilibiliVideo";
import { useYoutubeVideo } from "@/hooks/useYoutubeVideo";
import { useNotionVideo } from "@/hooks/useNotionVideo";
import { isBilibiliUrl } from "@/utils/bilibili";
import { isYoutubeUrl } from "@/utils/youtube/parser";
import ResizeCircle from "../ResizeCircle";
import ArrowConnectPointGroup from "../ArrowConnectPointGroup";
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
} from "../../constants";
import useSettingStore from "@/stores/useSettingStore";
import { shouldUseLocalVideoCache } from "@/utils/video";

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

  const { id, x, y, width, height, src, metaInfo, resizable = true } = element;
  const autoCacheRemoteVideo = useSettingStore(
    (state) => state.setting.misc.video.autoCacheRemote,
  );
  const shouldUseLocalVideo = useMemo(
    () => shouldUseLocalVideoCache(src, autoCacheRemoteVideo),
    [src, autoCacheRemoteVideo],
  );
  const isBilibili = useMemo(() => {
    if (!src) return false;
    if (metaInfo && "type" in metaInfo && metaInfo.type === "bilibili")
      return true;
    return isBilibiliUrl(src);
  }, [src, metaInfo]);

  const isYoutube = useMemo(() => {
    if (!src) return false;
    if (metaInfo && "type" in metaInfo && metaInfo.type === "youtube")
      return true;
    return isYoutubeUrl(src);
  }, [src, metaInfo]);

  const isNotion = useMemo(() => {
    if (!src) return false;
    if (metaInfo && "type" in metaInfo && metaInfo.type === "notion")
      return true;
    return false; // Notion 视频没有 URL 特征，只能通过 metaInfo 判断
  }, [src, metaInfo]);

  const biliMeta =
    metaInfo && "type" in metaInfo && metaInfo.type === "bilibili"
      ? metaInfo
      : undefined;
  const ytMeta =
    metaInfo && "type" in metaInfo && metaInfo.type === "youtube"
      ? metaInfo
      : undefined;
  const notionMeta =
    metaInfo && "type" in metaInfo && metaInfo.type === "notion"
      ? metaInfo
      : undefined;

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

  const {
    videoUrl: notionVideoUrl,
    loading: notionLoading,
    error: notionError,
    streamProgress: notionProgress,
  } = useNotionVideo(notionMeta);

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
        className="border-none"
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
        <If condition={isNotion}>
          <>
            <NotionVideoLoader
              loading={notionLoading}
              error={notionError}
              streamProgress={notionProgress}
            />
            <If condition={!!notionVideoUrl && !notionLoading && !notionError}>
              {notionMeta && notionMeta.cache !== false ? (
                <LocalVideo
                  src={notionVideoUrl as string}
                  controls
                  style={{ padding: 16, boxSizing: "border-box" }}
                  width={"100%"}
                  height={"100%"}
                />
              ) : (
                <video
                  src={notionVideoUrl as string}
                  controls
                  style={{
                    padding: 16,
                    boxSizing: "border-box",
                    display: "block",
                  }}
                  width={"100%"}
                  height={"100%"}
                />
              )}
            </If>
          </>
        </If>
        <If condition={!isBilibili && !isYoutube && !isNotion}>
          {shouldUseLocalVideo ? (
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
          ) : (
            <video
              src={src}
              controls
              style={{
                padding: 16,
                boxSizing: "border-box",
                display: "block",
              }}
              width={"100%"}
              height={"100%"}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
              }}
            />
          )}
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
        proximityBounds={{ x, y, width, height }}
        isSelected={isSelected}
        disabled={isMoveArrowClosing}
      />
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
