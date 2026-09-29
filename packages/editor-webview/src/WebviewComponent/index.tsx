import { useRef, useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { ReactEditor, useReadOnly, useSlateStatic } from "slate-react";
import { CustomModal, ResizeHandle, Webview } from "@tau/shared";
import type { WebviewRef } from "@tau/shared";
import { Transforms } from "slate";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";
import { Edit, FileCode, Trash2, RefreshCw, Maximize2, X } from "lucide-react";

import {
  IExtensionBaseProps,
  AddParagraph,
  useDragAndDrop,
  EditorContextMenu,
  useDragHandlerMenu,
  useIsLastElement,
  useUploadResource,
  IFileService,
  IResourceService,
  useNotifier,
  type EditorLoadingHandle,
} from "@tau/editor";
import type { WebviewElement } from "../types";
import { WebLinkSourceType } from "../types";

import InputUrlModal from "../InputUrlModal";
import { normalizeWebviewUrl } from "../utils/url";

import styles from "./index.module.less";

const WebviewComponent = (props: IExtensionBaseProps<WebviewElement>) => {
  const editor = useSlateStatic();
  const { element, children, attributes } = props;
  const { url, height = 400 } = element;
  const isLast = useIsLastElement(element);
  const webviewRef = useRef<WebviewRef>(null);
  const notifier = useNotifier();
  const readOnly = useReadOnly();
  const [editUrlOpen, setEditUrlOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [localUploadLoading, setLocalUploadLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } = useDragAndDrop({
    element,
  });

  const fileService = editor.getService(IFileService);
  const resourceService = editor.getService(IResourceService);
  const selectFile = fileService.select;
  const getFileBaseName = fileService.getBaseName;
  const readTextFile = fileService.readText;
  const uploadResource = useUploadResource();
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  useEffect(() => {
    if (element.sourceType === WebLinkSourceType.LOCAL && url) {
      const remoteResourceToLocal = resourceService.remoteResourceToLocal;
      if (remoteResourceToLocal) {
        remoteResourceToLocal(url)
          .then(localPath => {
            setLocalUrl(localPath);
          })
          .catch(err => {
            console.error("下载本地 HTML 失败:", err);
          });
      } else {
        setLocalUrl(url);
      }
    } else {
      setLocalUrl(null);
    }
  }, [url, element.sourceType, resourceService]);

  const displayUrl = element.sourceType === WebLinkSourceType.LOCAL ? localUrl : url;

  const handleHeightChange = useMemoizedFn((newHeight: number) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        height: newHeight,
      },
      {
        at: path,
      }
    );
  });

  const handleEditUrl = useMemoizedFn(() => {
    setEditUrlOpen(true);
  });

  const handleEditUrlConfirm = useMemoizedFn(
    ({ url: nextUrl, sourceType }: { url: string; sourceType: WebLinkSourceType }) => {
      const normalizedUrl =
        sourceType === WebLinkSourceType.REMOTE ? normalizeWebviewUrl(nextUrl) : nextUrl;
      if (!normalizedUrl) {
        setEditUrlOpen(false);
        return;
      }
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(
        editor,
        {
          url: normalizedUrl,
          sourceType,
        },
        {
          at: path,
        }
      );
      setEditUrlOpen(false);
    }
  );

  const handleDelete = useMemoizedFn(async () => {
    const confirmed = await notifier.confirm({
      title: "确认删除",
      description: "确定要删除这个网页视图吗？",
      confirmText: "删除",
      danger: true,
    });
    if (!confirmed) return;
    const path = ReactEditor.findPath(editor, element);
    Transforms.removeNodes(editor, { at: path });
  });

  const handleRefresh = useMemoizedFn(() => {
    webviewRef.current?.reload();
  });

  const handleFullscreen = useMemoizedFn(() => {
    fullscreenContainerRef.current?.requestFullscreen();
    setIsFullscreen(true);
  });

  const handleExitFullscreen = useMemoizedFn(() => {
    document.exitFullscreen();
    setIsFullscreen(false);
  });

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleSelectLocalHtml = useMemoizedFn(async () => {
    if (!uploadResource) {
      notifier.error("当前编辑器未配置上传能力");
      return;
    }
    const filePaths = await selectFile?.({
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
    let progress: EditorLoadingHandle | undefined;
    try {
      setLocalUploadLoading(true);
      progress = notifier.loading("正在上传 HTML 文件…");
      const fileName = getFileBaseName?.(filePath) || "";
      const fileContent = await readTextFile?.(filePath);
      const htmlFile = new File([fileContent as any], fileName, {
        type: "text/html",
      });
      const uploadedUrl = await uploadResource(htmlFile);
      if (!uploadedUrl) {
        progress.error("上传 HTML 文件失败");
        return;
      }
      const normalizedUrl = normalizeWebviewUrl(uploadedUrl);
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(
        editor,
        {
          url: normalizedUrl,
          sourceType: WebLinkSourceType.LOCAL,
        },
        {
          at: path,
        }
      );
      progress.success("HTML 文件已插入");
    } catch (error) {
      console.error("选择 HTML 文件失败:", error);
      if (progress) progress.error("选择 HTML 文件失败");
      else notifier.error("选择 HTML 文件失败");
    } finally {
      setLocalUploadLoading(false);
    }
  });

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: () => [
      {
        key: "edit",
        label: "编辑",
        icon: <Edit size={16} />,
        onSelect: handleEditUrl,
      },
      {
        key: "selectLocalHtml",
        label: localUploadLoading ? "上传中..." : "选择本地 HTML",
        icon: <FileCode size={16} />,
        onSelect: handleSelectLocalHtml,
        disabled: localUploadLoading,
      },
      {
        key: "fullscreen",
        label: "全屏查看",
        icon: <Maximize2 size={16} />,
        onSelect: handleFullscreen,
      },
      {
        key: "refresh",
        label: "刷新",
        icon: <RefreshCw size={16} />,
        onSelect: handleRefresh,
      },
      {
        key: "delete",
        label: "删除",
        icon: <Trash2 size={16} />,
        onSelect: handleDelete,
        danger: true,
      },
    ],
  });

  return (
    <div
      ref={node => {
        drop(node);
      }}
      className={classnames(styles.container, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
      <div {...attributes}>
        <div className={styles.webviewWrapper} ref={fullscreenContainerRef} style={{ height }}>
          {isFullscreen && (
            <button className={styles.exitFullscreenBtn} onClick={handleExitFullscreen}>
              <X size={24} />
            </button>
          )}
          {displayUrl && (
            <Webview
              ref={webviewRef}
              src={displayUrl}
              sourceType={element.sourceType}
              style={{
                width: "100%",
                height: "100%",
                pointerEvents: isResizing ? "none" : "auto",
              }}
              allowPopups={false}
              convertFileSrc={fileService.convertFileSrc}
              getHomeDir={fileService.getHomeDir}
              remoteResourceToLocal={resourceService.remoteResourceToLocal}
              cdnUrlResolver={resourceService.resolveCdnUrl}
            />
          )}
          <ResizeHandle
            initialHeight={height}
            minHeight={200}
            maxHeight={800}
            onHeightChange={handleHeightChange}
            onResizeStart={() => {
              setIsResizing(true);
            }}
            onResizeEnd={() => {
              setIsResizing(false);
            }}
          />
        </div>

        {children}

        {!(readOnly && isLast) && <AddParagraph element={element} />}
        <div
          contentEditable={false}
          ref={node => {
            drag(node);
          }}
          className={classnames(styles.dragHandler, {
            [styles.canDrag]: canDrag,
          })}
          {...dragHandlerProps}
        >
          <MdDragIndicator className={styles.icon} />
        </div>
        <EditorContextMenu {...menuProps} readonly={readOnly} />

        <CustomModal
          title={null}
          open={editUrlOpen}
          footer={null}
          showCloseButton={false}
          width={460}
          centered
          onCancel={() => setEditUrlOpen(false)}
        >
          <InputUrlModal
            editor={editor}
            title="编辑网页地址"
            defaultValue={url}
            defaultSourceType={element.sourceType ?? WebLinkSourceType.REMOTE}
            onOk={handleEditUrlConfirm}
            onCancel={() => setEditUrlOpen(false)}
          />
        </CustomModal>
      </div>
    </div>
  );
};

export default WebviewComponent;
