import { imageWebviewTranslator, useImageWebviewI18n } from "../../image-webview.i18n";
import {
  useCallback,
  memo,
  useMemo,
  useState,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { useMemoizedFn } from "ahooks";
import { Menu, toast } from "@tau/ui";
import { MoreHorizontal, Pencil, RefreshCw, Upload } from "lucide-react";
import { If } from "@tau/ui";
import { ResizeCircle as ResizeCircle } from "@tau/whiteboard";
import { ArrowConnectPointGroup as ArrowConnectPointGroup } from "@tau/whiteboard";
import { ArrowDropConnectPoint as ArrowDropConnectPoint } from "@tau/whiteboard";
import { SketchRect as SketchRect } from "@tau/whiteboard";
import { Webview } from "@tau/shared";
import type { WebviewRef } from "@tau/shared";
import { convertFileSrc, getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils";

import { EHandlerPosition, Point, WebviewElement } from "@tau/whiteboard";
import { PointUtil } from "@tau/whiteboard";
import {
  useBoard,
  useSelectState,
  useDropArrow,
  useSelection,
  useBoardState,
  useSketch,
} from "@tau/whiteboard";
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  SELECT_RECT_FILL_OPACITY,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
  SKETCH_MEDIA_FRAME,
} from "@tau/whiteboard";
import { IResourceService } from "@tau/shared/host-services";
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
    element: WebviewElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean
  ) => void;
  onResizeEnd?: (
    element: WebviewElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point
  ) => void;
}

const DRAG_PADDING = 20;

const WebviewElementComponent = memo((props: WebviewElementProps) => {
  const { t } = useImageWebviewI18n();
  const { element, onResize, onResizeStart, onResizeEnd } = props;
  const { id, x, y, width, height, url } = element;

  const [isResizing, setIsResizing] = useState(false);
  const { movingStore } = useBoardState();
  const isMoving = useSyncExternalStore(movingStore.subscribe, movingStore.getBoardMoving);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [tempUrl, setTempUrl] = useState(url);
  const webviewRef = useRef<WebviewRef>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadResource = (file: File) => board.getService(IResourceService).upload(file);
  const [localUploadLoading, setLocalUploadLoading] = useState(false);

  const board = useBoard();
  const resolveResource = useCallback(
    async (value: string) => {
      if (!value.startsWith("tau-collab-")) return remoteResourceToLocal(value);
      const resolve = board.getService(IResourceService).remoteResourceToLocal;
      if (!resolve) throw new Error("资源服务缺少本地化能力");
      return resolve(value);
    },
    [board]
  );
  const { isSelected } = useSelectState(id);
  const sketch = useSketch(element);
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
      onResize(element, position, startPoint, endPoint, isPreserveRatio, isAdsorb);
    }
  );

  const handleOnResizeEnd = useMemoizedFn(
    (position: EHandlerPosition, startPoint: Point, endPoint: Point) => {
      setIsResizing(false);
      onResizeEnd?.(element, position, startPoint, endPoint);
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
        toast.error(imageWebviewTranslator.t("webview.invalid"));
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
      toast.error(imageWebviewTranslator.t("webview.noUpload"));
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
        toast.error(imageWebviewTranslator.t("webview.uploadFailed"));
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
        toast.success(imageWebviewTranslator.t("webview.htmlAdded"));
      }
    } catch (error) {
      console.error(error);
      toast.error(imageWebviewTranslator.t("webview.fileFailed"));
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
            remoteResourceToLocal={resolveResource}
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
                  {t("webview.editUrl")}
                </Menu.Item>
                <Menu.Item
                  onSelect={handleSelectLocalHtml}
                  disabled={localUploadLoading}
                  icon={<Upload size={14} />}
                >
                  {localUploadLoading ? t("webview.uploading") : t("webview.localHtml")}
                </Menu.Item>
                <Menu.Item onSelect={() => handleRefresh()} icon={<RefreshCw size={14} />}>
                  {t("refresh")}
                </Menu.Item>
              </Menu>
            </If>
          </div>
        </If>
      </foreignObject>
      {sketch.enabled && (
        <SketchRect
          x={x}
          y={y}
          width={width}
          height={height}
          radius={4}
          stroke={SKETCH_MEDIA_FRAME}
          strokeWidth={1.5}
          level={sketch.level}
          seed={sketch.seed}
        />
      )}

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
