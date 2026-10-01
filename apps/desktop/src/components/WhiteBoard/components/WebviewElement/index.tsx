import { memo, useMemo, useState, useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { Menu, toast } from "@tau/ui";
import { MoreHorizontal, Pencil, RefreshCw, Upload } from "lucide-react";
import If from "@/components/If";
import ResizeCircle from "../ResizeCircle";
import ArrowConnectPointGroup from "../ArrowConnectPointGroup";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";
import { Webview } from "@tau/shared";
import type { WebviewRef } from "@tau/shared";
import { convertFileSrc, getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";

import { Board, EHandlerPosition, Point, WebviewElement } from "../../types";
import { PointUtil } from "../../utils";
import { useBoard, useSelectState, useDropArrow, useSelection, useBoardState } from "../../hooks";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  SELECT_RECT_FILL_OPACITY,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
} from "../../constants";
import useUploadResource from "@/hooks/useUploadResource";
import { selectFile, readTextFile, getFileBaseName } from "@/commands";
import { normalizeWebviewUrl } from "@/utils";

const styles = {
  toolBar: "box-border flex h-full items-center justify-between rounded-tau-sm px-2 py-1",
  urlInput:
    "bg-surface text-ink-1 h-6 w-full flex-1 rounded-[2px] border border-accent px-2 text-tau-meta outline-none",
  settings: "flex size-7 cursor-pointer items-center justify-center rounded-tau-sm",
};

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
    isAdsorb?: boolean
  ) => void;
  onResizeEnd?: (
    board: Board,
    element: WebviewElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point
  ) => void;
}

const DRAG_PADDING = 20;

const WebviewElementComponent = memo((props: WebviewElementProps) => {
  const { element, onResize, onResizeStart, onResizeEnd } = props;
  const { id, x, y, width, height, url } = element;

  const [isResizing, setIsResizing] = useState(false);
  const { isMoving } = useBoardState();
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [tempUrl, setTempUrl] = useState(url);
  const webviewRef = useRef<WebviewRef>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadResource = useUploadResource();
  const [localUploadLoading, setLocalUploadLoading] = useState(false);

  const board = useBoard();
  const { isSelected } = useSelectState(id);
  const selection = useSelection();
  const isSelecting = Boolean(selection && selection.selectArea);

  const { isMoveArrowClosing, activeConnectId, arrowConnectPoints, arrowConnectExtendPoints } =
    useDropArrow(element);

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
      isAdsorb?: boolean
    ) => {
      onResize(board, element, position, startPoint, endPoint, isPreserveRatio, isAdsorb);
    }
  );

  const handleOnResizeEnd = useMemoizedFn(
    (position: EHandlerPosition, startPoint: Point, endPoint: Point) => {
      setIsResizing(false);
      onResizeEnd?.(board, element, position, startPoint, endPoint);
    }
  );

  const handleUrlChange = useMemoizedFn((e: React.ChangeEvent<HTMLInputElement>) => {
    setTempUrl(e.target.value);
  });

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
      const normalizedUrl = normalizeWebviewUrl(tempUrl);
      if (!normalizedUrl) {
        toast.error("请输入有效的网页地址");
        setTempUrl(url);
        return;
      }
      const path = board.children.findIndex(item => item.id === id);
      if (path !== -1) {
        board.apply({
          type: "set_node",
          path: [path],
          properties: { url: element.url, sourceType: element.sourceType },
          newProperties: { url: normalizedUrl, sourceType: "remote" },
        });
        setTempUrl(normalizedUrl);
      }
    }
  });

  const handleSelectLocalHtml = useMemoizedFn(async () => {
    if (!uploadResource) {
      toast.error("当前环境未配置上传能力");
      return;
    }
    const filePaths = await selectFile({
      properties: ["openFile"],
      filters: [
        {
          name: "HTML",
          extensions: ["html", "htm"],
        },
      ],
    });
    if (!filePaths || filePaths.length === 0) return;
    const filePath = filePaths[0];
    try {
      setLocalUploadLoading(true);
      const fileName = await getFileBaseName(filePath);
      const fileContent = await readTextFile(filePath);
      const htmlFile = new File([fileContent], fileName, {
        type: "text/html",
      });
      const uploadedUrl = await uploadResource(htmlFile);
      if (!uploadedUrl) {
        toast.error("上传 HTML 文件失败");
        return;
      }
      const path = board.children.findIndex(item => item.id === id);
      if (path !== -1) {
        board.apply({
          type: "set_node",
          path: [path],
          properties: { url: element.url, sourceType: element.sourceType },
          newProperties: { url: uploadedUrl, sourceType: "local" },
        });
        setTempUrl(uploadedUrl);
        toast.success("HTML 文件已添加");
      }
    } catch (error) {
      console.error(error);
      toast.error("选择 HTML 文件失败");
    } finally {
      setLocalUploadLoading(false);
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
        className="border-none"
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
            sourceType={element.sourceType}
            style={{
              width: "100%",
              height: "100%",
              pointerEvents: isMoving || isSelecting || isResizing || isSelected ? "none" : "auto",
            }}
            convertFileSrc={convertFileSrc}
            getHomeDir={getHomeDir}
            remoteResourceToLocal={remoteResourceToLocal}
            cdnUrlResolver={useGithubCdnUrl}
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
              <Menu
                align="end"
                trigger={
                  <div className={styles.settings}>
                    <MoreHorizontal size={14} />
                  </div>
                }
              >
                <Menu.Item onSelect={() => handleUrlEdit()} icon={<Pencil size={14} />}>
                  编辑地址
                </Menu.Item>
                <Menu.Item
                  onSelect={handleSelectLocalHtml}
                  disabled={localUploadLoading}
                  icon={<Upload size={14} />}
                >
                  {localUploadLoading ? "上传中..." : "选择本地 HTML"}
                </Menu.Item>
                <Menu.Item onSelect={() => handleRefresh()} icon={<RefreshCw size={14} />}>
                  刷新
                </Menu.Item>
              </Menu>
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

export default WebviewElementComponent;
