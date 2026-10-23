import { IFileService, IResourceService } from "@tau/shared/host-services";
import { useRef, useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import {
  ReactEditor,
  useReadOnly,
  useSelected,
  useSlateSelector,
  useSlateStatic,
} from "slate-react";
import { ResizeHandle, Webview } from "@tau/shared";
import type { WebviewRef } from "@tau/shared";
import { Editor, Range, Transforms } from "slate";
import { Expand, MousePointerClick, X } from "lucide-react";
import { cn } from "@tau/ui";

import {
  type ElementRenderProps as IExtensionBaseProps,
  AddParagraph,
  useIsLastElement,
  useNotifier,
  type EditorLoadingHandle,
  ELEMENT_SELECTED_OUTLINE_CLASS,
  useTouchInteraction,
} from "@tau/editor/api";
import type { WebviewElement } from "../types";
import { WebLinkSourceType } from "../types";

import InputUrlModal from "../InputUrlModal";
import { normalizeWebviewUrl } from "../utils/url";
import { webviewActionsMap } from "../menu";

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
  const touch = useTouchInteraction();
  const inSelection = useSelected();
  const collapsed = useSlateSelector(
    current => !!current.selection && Range.isCollapsed(current.selection)
  );
  const selected = touch && !readOnly && inSelection && collapsed;
  // 触屏下默认盖一层遮罩，滑动滚的是正文；点按后才与网页交互，正文滚动或离开视口时恢复
  const [interactive, setInteractive] = useState(false);

  const fileService = editor.getService(IFileService);
  const resourceService = editor.getService(IResourceService);
  const selectFile = fileService.select;
  const getFileBaseName = fileService.getBaseName;
  const readTextFile = fileService.readText;
  const uploadResource = resourceService.upload;
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
    if (!touch || !interactive) return;
    const container = fullscreenContainerRef.current;
    const release = () => setInteractive(false);
    // 网页内部滚动发生在 iframe 自己的文档里，不会触发这里的 scroll
    document.addEventListener("scroll", release, { capture: true, passive: true });
    const observer =
      container && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => {
            if (entry && !entry.isIntersecting) release();
          })
        : null;
    if (container) observer?.observe(container);
    return () => {
      document.removeEventListener("scroll", release, { capture: true });
      observer?.disconnect();
    };
  }, [touch, interactive]);

  const selectInEditor = useMemoizedFn(() => {
    if (readOnly) return;
    const path = ReactEditor.findPath(editor, element);
    Transforms.select(editor, Editor.start(editor, path));
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

  // 菜单命令（tau.webview.*）从这里取动作；上传状态经 isUploading 供菜单打开时读取
  useEffect(() => {
    webviewActionsMap.set(element, {
      editUrl: handleEditUrl,
      selectLocalHtml: handleSelectLocalHtml,
      fullscreen: handleFullscreen,
      refresh: handleRefresh,
      isUploading: () => localUploadLoading,
    });
    return () => {
      webviewActionsMap.delete(element);
    };
  }, [
    element,
    handleEditUrl,
    handleSelectLocalHtml,
    handleFullscreen,
    handleRefresh,
    localUploadLoading,
  ]);

  return (
    <div className="relative">
      <div {...attributes}>
        <div
          className={cn(
            "relative box-border w-full rounded-[0.25em] border border-solid border-[var(--ed-border)] [&:fullscreen]:h-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-none",
            selected && ELEMENT_SELECTED_OUTLINE_CLASS
          )}
          ref={fullscreenContainerRef}
          style={{ height }}
        >
          {isFullscreen && (
            // 压在网页内容上的固定深色按钮，不随主题
            <button
              className="absolute right-[16px] top-[16px] z-10 flex h-[40px] w-[40px] cursor-pointer items-center justify-center rounded-[8px] border-none bg-[rgba(0,0,0,0.6)] text-white transition-[background] duration-200 hover:bg-[rgba(0,0,0,0.8)]"
              onClick={handleExitFullscreen}
            >
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
            />
          )}
          {touch && !interactive && !isFullscreen && (
            <div
              className="bg-linear-to-b absolute inset-0 z-[1] flex items-end justify-center from-transparent from-50% to-[var(--ed-bg-surface)] pb-3"
              onClick={selectInEditor}
            >
              <button
                type="button"
                aria-label="全屏查看"
                className="absolute right-2 top-2 grid size-9 place-items-center rounded-full border-none bg-[var(--ed-bg-surface)] text-[var(--ed-text-secondary)] shadow-[var(--ed-shadow-float)]"
                onClick={event => {
                  event.stopPropagation();
                  handleFullscreen();
                }}
              >
                <Expand size={16} />
              </button>
              <button
                type="button"
                className="text-tau-sm flex h-8 items-center gap-1.5 rounded-full border-none bg-[var(--ed-text)] px-3 font-semibold text-[var(--ed-text-inverse)] shadow-[var(--ed-shadow-float)]"
                onClick={event => {
                  event.stopPropagation();
                  setInteractive(true);
                }}
              >
                <MousePointerClick size={14} />
                点按与网页交互
              </button>
            </div>
          )}
          {!readOnly && !touch && (
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
          )}
        </div>

        {children}

        {!(readOnly && isLast) && <AddParagraph element={element} />}

        <InputUrlModal
          editor={editor}
          open={editUrlOpen}
          title="编辑网页地址"
          subtitle="修改远程网址，或重新上传本地 HTML 文件"
          okText="保存"
          defaultValue={url}
          defaultSourceType={element.sourceType ?? WebLinkSourceType.REMOTE}
          onOk={handleEditUrlConfirm}
          onCancel={() => setEditUrlOpen(false)}
        />
      </div>
    </div>
  );
};

export default WebviewComponent;
