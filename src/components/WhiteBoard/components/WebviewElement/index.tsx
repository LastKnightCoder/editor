import { memo, useMemo, useState, useEffect, useRef, useContext } from "react";
import { useMemoizedFn } from "ahooks";
import { Dropdown } from "antd";
import { MoreOutlined, EditOutlined, SyncOutlined } from "@ant-design/icons";
import If from "@/components/If";
import ResizeCircle from "../ResizeCircle";
import ArrowConnectPoint from "../ArrowConnectPoint";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";
import Webview, { WebviewRef } from "@/components/Webview";

import { Board, EHandlerPosition, Point, WebviewElement } from "../../types";
import { PointUtil } from "../../utils";
import {
  useBoard,
  useSelectState,
  useDropArrow,
  useSelection,
} from "../../hooks";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  SELECT_RECT_FILL_OPACITY,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
  ARROW_CONNECT_POINT_FILL,
  ARROW_CONNECT_POINT_RADIUS,
} from "../../constants";
import { BoardStateContext } from "../../context";

import styles from "./index.module.less";

interface WebviewElementProps {
  element: WebviewElement;
  onResizeStart?: (element: WebviewElement, startPoint: Point) => void;
  onResize: (
    board: Board,
    element: WebviewElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean,
  ) => void;
  onResizeEnd?: (
    board: Board,
    element: WebviewElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
  ) => void;
}

const DRAG_PADDING = 20;

const WebviewElementComponent = memo((props: WebviewElementProps) => {
  const { element, onResize, onResizeStart, onResizeEnd } = props;
  const { id, x, y, width, height, url } = element;

  const [isResizing, setIsResizing] = useState(false);
  const { isMoving } = useContext(BoardStateContext);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [tempUrl, setTempUrl] = useState(url);
  const webviewRef = useRef<WebviewRef>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const board = useBoard();
  const { isSelected } = useSelectState(id);
  const selection = useSelection();
  const isSelecting = Boolean(selection && selection.selectArea);

  const {
    isMoveArrowClosing,
    activeConnectId,
    arrowConnectPoints,
    arrowConnectExtendPoints,
  } = useDropArrow(element);

  const [resizePoints] = useMemo(() => {
    const resizePoints = PointUtil.getResizePointFromRect({
      x: x,
      y: y,
      width: width,
      height: height,
    });

    return [resizePoints];
  }, [x, y, width, height]);

  const handleOnResizeStart = useMemoizedFn((startPoint: Point) => {
    setIsResizing(true);
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
      setIsResizing(false);
      onResizeEnd?.(board, element, position, startPoint, endPoint);
    },
  );

  const handleUrlChange = useMemoizedFn(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTempUrl(e.target.value);
    },
  );

  const handleUrlBlur = useMemoizedFn(() => {
    setIsEditingUrl(false);
    saveUrl();
  });

  const handleUrlKeyDown = useMemoizedFn((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setIsEditingUrl(false);
      saveUrl();
    }
    e.stopPropagation();
  });

  const saveUrl = useMemoizedFn(() => {
    if (tempUrl !== url) {
      const path = board.children.findIndex((item) => item.id === id);
      if (path !== -1) {
        board.apply({
          type: "set_node",
          path: [path],
          properties: element,
          newProperties: {
            ...element,
            url: tempUrl,
          },
        });
      }
    }
  });

  const handleRefresh = useMemoizedFn(() => {
    webviewRef.current?.reload();
  });

  const handleUrlEdit = useMemoizedFn(() => {
    setIsEditingUrl(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  });

  useEffect(() => {
    setTempUrl(url);
  }, [url]);

  return (
    <>
      <foreignObject
        x={x - DRAG_PADDING}
        y={y - DRAG_PADDING}
        width={width + DRAG_PADDING * 2}
        height={height + DRAG_PADDING * 2}
        style={{ position: "relative", overflow: "visible" }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            // 必须给 padding，否则无法拖动，webview 里面的事件都监听不到
            padding: DRAG_PADDING,
            boxSizing: "border-box",
            cursor: "move",
          }}
        >
          <Webview
            ref={webviewRef}
            src={url}
            style={{
              width: "100%",
              height: "100%",
              pointerEvents:
                isMoving || isSelecting || isResizing || isSelected
                  ? "none"
                  : "auto",
            }}
          />
        </div>

        {/* 操作栏 Dropdown */}
        <If condition={isSelected}>
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 1000,
            }}
          >
            <If condition={isEditingUrl}>
              <div className={styles.toolBar}>
                <input
                  ref={inputRef}
                  type="text"
                  className={styles.urlInput}
                  value={tempUrl}
                  onChange={handleUrlChange}
                  onBlur={handleUrlBlur}
                  onKeyDown={handleUrlKeyDown}
                />
              </div>
            </If>
            <If condition={!isEditingUrl}>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: "editUrl",
                      label: "编辑地址",
                      onClick: () => handleUrlEdit(),
                      icon: <EditOutlined />,
                    },
                    {
                      key: "refresh",
                      label: "刷新",
                      onClick: () => handleRefresh(),
                      icon: <SyncOutlined />,
                    },
                  ],
                }}
                trigger={["click"]}
              >
                <div className={styles.settings}>
                  <MoreOutlined />
                </div>
              </Dropdown>
            </If>
          </div>
        </If>
      </foreignObject>

      <If condition={isSelected}>
        <g>
          <rect
            // 减去 padding
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

export default WebviewElementComponent;
