import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { ReactEditor, useReadOnly, useSlateStatic } from "slate-react";
import { Transforms, Path } from "slate";
import { Button, Input, Spin, App } from "antd";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";

import { IExtensionBaseProps } from "../../../../extensions/types";
import type { VideoElement } from "../../../../types";
import AddParagraph from "../../../../components/AddParagraph";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import useUploadResource from "../../../../hooks/useUploadResource";
import {
  useImageResize,
  ResizeDirection,
} from "../../../../hooks/useImageResize";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import {
  BilibiliVideoSelectResult,
  YoutubeVideoSelectResult,
  NotionVideoSelectResult,
} from "../../../../types";

import {
  If,
  ModernTabs,
  useBilibiliVideoWithContext,
  useYoutubeVideoWithContext,
  useNotionVideoWithContext,
  useRemoteVideoWithContext,
} from "@tau/shared";

import type {
  IResource,
  VideoMetaInfo,
  BiliBiliVideoMetaInfo,
  YouTubeVideoMetaInfo,
  NotionVideoMetaInfo,
} from "../../../types";

import styles from "./index.module.less";
import useTheme from "../../../../hooks/useTheme";
import { LinkOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { buildVideoMenuItems } from "../../utils/menuItems";

function isBiliMetaInfo(m?: VideoMetaInfo): m is BiliBiliVideoMetaInfo {
  return !!m && (m as BiliBiliVideoMetaInfo).type === "bilibili";
}

function isYoutubeMetaInfo(m?: VideoMetaInfo): m is YouTubeVideoMetaInfo {
  return !!m && (m as YouTubeVideoMetaInfo).type === "youtube";
}

function isNotionMetaInfo(m?: VideoMetaInfo): m is NotionVideoMetaInfo {
  return !!m && (m as NotionVideoMetaInfo).type === "notion";
}

const VideoComponent = (props: IExtensionBaseProps<VideoElement>) => {
  const { element, children, attributes } = props;
  const readOnly = useReadOnly();
  const isLast = useIsLastElement(element);
  const editor = useSlateStatic();
  const { message } = App.useApp();
  const uploadRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [networkUrl, setNetworkUrl] = useState("");
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [maxWidth, setMaxWidth] = useState<number>(Infinity);
  const [isSelected, setIsSelected] = useState(false);
  const Video = editor.services?.components?.Video;

  // Modal 状态
  const [biliModalOpen, setBiliModalOpen] = useState(false);
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);
  const [notionModalOpen, setNotionModalOpen] = useState(false);
  const { isDark } = useTheme();

  const ResourcePickerModal = editor.services?.components?.ResourcePickerModal;
  const BilibiliVideoLoader = editor.services?.components?.BilibiliVideoLoader;
  const YoutubeVideoLoader = editor.services?.components?.YoutubeVideoLoader;
  const NotionVideoLoader = editor.services?.components?.NotionVideoLoader;
  const BilibiliVideoSelectModal =
    editor.services?.components?.BilibiliVideoSelectModal;
  const YoutubeVideoSelectModal =
    editor.services?.components?.YoutubeVideoSelectModal;
  const NotionVideoSelectModal =
    editor.services?.components?.NotionVideoSelectModal;
  const RemoteVideoLoader = editor.services?.components?.RemoteVideoLoader;

  const isBilibiliUrl = (url: string) =>
    editor.services?.media.isBilibiliUrl(url) ?? false;
  const isYoutubeUrl = (url: string) =>
    editor.services?.media.isYoutubeUrl(url) ?? false;
  const shouldUseLocalVideoCache = (src: string) =>
    editor.services?.media.shouldUseLocalCache(src) ?? true;

  const isBilibili = useMemo(
    () => isBiliMetaInfo(element.metaInfo),
    [element.metaInfo],
  );
  const isYoutube = useMemo(
    () => isYoutubeMetaInfo(element.metaInfo),
    [element.metaInfo],
  );
  const isNotion = useMemo(() => {
    return isNotionMetaInfo(element.metaInfo);
  }, [element.metaInfo]);

  const biliMeta = isBiliMetaInfo(element.metaInfo) ? element.metaInfo : null;
  const ytMeta = isYoutubeMetaInfo(element.metaInfo)
    ? element.metaInfo
    : undefined;
  const notionMeta = isNotionMetaInfo(element.metaInfo)
    ? element.metaInfo
    : undefined;

  const {
    videoUrl: bilibiliVideoUrl,
    loading: bilibiliLoading,
    error: bilibiliError,
    streamProgress: bilibiliProgress,
  } = useBilibiliVideoWithContext(biliMeta || undefined);

  const {
    videoUrl: youtubeVideoUrl,
    loading: youtubeLoading,
    error: youtubeError,
    streamProgress: youtubeProgress,
  } = useYoutubeVideoWithContext(ytMeta);

  const {
    videoUrl: notionVideoUrl,
    loading: notionVideoLoading,
    error: notionVideoError,
    streamProgress: notionProgress,
  } = useNotionVideoWithContext(notionMeta || undefined);

  // Get src from element for use in isRegularRemoteVideo check
  const elementSrc = element.src;

  // Check if this is a regular remote video (not Bilibili/YouTube/Notion)
  const isRegularRemoteVideo = useMemo(() => {
    if (!elementSrc) return false;
    if (isBilibili || isYoutube || isNotion) return false;
    return (
      elementSrc.startsWith("http://") || elementSrc.startsWith("https://")
    );
  }, [elementSrc, isBilibili, isYoutube, isNotion]);

  const {
    videoUrl: remoteVideoUrl,
    loading: remoteVideoLoading,
    error: remoteVideoError,
    streamProgress: remoteVideoProgress,
  } = useRemoteVideoWithContext(isRegularRemoteVideo ? elementSrc : undefined);

  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } =
    useDragAndDrop({
      element,
    });
  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: (params) => buildVideoMenuItems(params),
  });

  const uploadFile = useUploadResource();
  const setUploading = useMemoizedFn((uploading) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        uploading,
      },
      {
        at: path,
      },
    );
  });

  const handleOnNetworkUrlInputFinish = useMemoizedFn(() => {
    const trimmed = networkUrl.trim();
    if (!trimmed) {
      message.warning("请输入视频地址");
      return;
    }

    if (
      (isBilibiliUrl(trimmed) || isYoutubeUrl(trimmed)) &&
      !element.metaInfo
    ) {
      message.error("缺少 metaInfo，请通过对应入口创建该平台视频");
      return;
    }

    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        src: trimmed,
        metaInfo: undefined,
      },
      {
        at: path,
      },
    );
    setNetworkUrl("");
  });
  const handleUploadFileChange = useMemoizedFn(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        message.warning("请选择文件");
        e.target.value = "";
        return;
      }
      setUploading(true);
      if (!uploadFile) {
        message.warning("尚未配置任何资源上传设置，无法上传资源");
        return null;
      }
      const path = ReactEditor.findPath(editor, element);
      const uploadRes = await uploadFile(file);
      if (!uploadRes) {
        setUploading(false);
        e.target.value = "";
        return;
      }
      Transforms.setNodes(
        editor,
        {
          src: uploadRes,
        },
        {
          at: path,
        },
      );
      setUploading(false);
      e.target.value = "";
    },
  );

  const handleInsertFromResource = useMemoizedFn(
    async (selected: IResource[]) => {
      if (!selected.length) {
        setResourcePickerOpen(false);
        return;
      }
      const [first, ...rest] = selected;
      const firstSrc = first.path ?? first.url;
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(
        editor,
        {
          src: firstSrc,
          uploading: false,
          metaInfo: undefined,
        },
        { at: path },
      );

      let referencePath = path;
      rest.forEach((resource) => {
        const resourceSrc = resource.path ?? resource.url;
        if (!resourceSrc) {
          return;
        }
        referencePath = Path.next(referencePath);
        Transforms.insertNodes(
          editor,
          {
            type: "video",
            src: resourceSrc,
            children: [
              {
                type: "formatted",
                text: "",
              },
            ],
          },
          { at: referencePath },
        );
      });

      setResourcePickerOpen(false);
    },
  );

  // 处理 Bilibili 视频确认
  const handleBilibiliConfirm = useMemoizedFn(
    async (result: BilibiliVideoSelectResult) => {
      try {
        const path = ReactEditor.findPath(editor, element);
        Transforms.setNodes(
          editor,
          {
            src: result.url,
            metaInfo: result.metaInfo,
          },
          { at: path },
        );

        setBiliModalOpen(false);
      } catch (error) {
        console.error("添加 Bilibili 视频失败:", error);
        message.error("添加 Bilibili 视频失败");
      }
    },
  );

  // 解析并写入YouTube metaInfo
  const handleYoutubeConfirm = useMemoizedFn(
    async (result: YoutubeVideoSelectResult) => {
      try {
        const meta: YouTubeVideoMetaInfo = {
          type: "youtube",
          url: result.url,
          videoStream: result.videoStream,
          audioStream: result.audioStream,
        };

        const path = ReactEditor.findPath(editor, element);
        Transforms.setNodes(
          editor,
          {
            src: result.url,
            metaInfo: meta,
          },
          { at: path },
        );

        setYoutubeModalOpen(false);
      } catch (error) {
        console.error("添加 YouTube 视频失败:", error);
        message.error("添加 YouTube 视频失败");
      }
    },
  );

  // 处理 Notion 视频确认
  const handleNotionConfirm = useMemoizedFn(
    async (result: NotionVideoSelectResult) => {
      try {
        const path = ReactEditor.findPath(editor, element);
        Transforms.setNodes<VideoElement>(
          editor,
          {
            metaInfo: result.metaInfo,
            src: `notion://${result.blockId}`,
          },
          { at: path },
        );

        setNotionModalOpen(false);
        message.success("Notion 视频添加成功");
      } catch (error) {
        console.error("添加 Notion 视频失败:", error);
        message.error("添加 Notion 视频失败");
      }
    },
  );

  const { src, uploading, playbackRate = 1, width, align = "center" } = element;

  // 外部点击取消选中
  useEffect(() => {
    const handleDocMouseDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const target = e.target as Node;
      if (!containerRef.current.contains(target)) {
        setIsSelected(false);
      }
    };
    document.addEventListener("mousedown", handleDocMouseDown);
    return () => document.removeEventListener("mousedown", handleDocMouseDown);
  }, []);

  // 计算编辑器可用最大宽度
  useEffect(() => {
    const editorEl = containerRef.current?.closest(
      '[data-slate-editor="true"]',
    ) as HTMLElement | null;
    if (editorEl) {
      setMaxWidth(editorEl.clientWidth);
    }
  }, []);

  const updateElementWidth = useMemoizedFn((newWidth?: number) => {
    if (typeof newWidth !== "number") return;
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { width: newWidth }, { at: path });
  });

  const handleSelect = useMemoizedFn((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly) {
      return;
    }
    setIsSelected(true);
  });

  const handleVideoLoad = useMemoizedFn(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      const videoNaturalWidth = video.videoWidth;
      const videoNaturalHeight = video.videoHeight;
      setNaturalSize({ width: videoNaturalWidth, height: videoNaturalHeight });

      if (!width) {
        const editorEl = containerRef.current?.closest(
          '[data-slate-editor="true"]',
        ) as HTMLElement | null;
        const editorWidth = editorEl?.clientWidth || 0;
        const initialWidth = Math.min(
          videoNaturalWidth,
          editorWidth || videoNaturalWidth,
        );
        updateElementWidth(initialWidth);
        resize.setSize({ width: initialWidth });
      }
    }
  });

  const resize = useImageResize({
    initialSize: { width },
    minWidth: 200,
    maxWidth,
    minHeight: 100,
    aspectRatio:
      naturalSize.width && naturalSize.height
        ? naturalSize.width / naturalSize.height
        : undefined,
    onResizeEnd: (size) => {
      if (size.width) {
        updateElementWidth(size.width);
      }
    },
    readonly: readOnly,
    keepAspectRatio: true,
  });

  // 仅四角句柄
  const RESIZE_HANDLES: { direction: ResizeDirection; cursor: string }[] = [
    { direction: "nw", cursor: "nwse-resize" },
    { direction: "ne", cursor: "nesw-resize" },
    { direction: "se", cursor: "nwse-resize" },
    { direction: "sw", cursor: "nesw-resize" },
  ];

  // 包裹视频的容器，添加调整大小功能
  const renderVideoContainer = (videoUrl: string, useLocalVideo = true) => {
    const shouldUseLocalVideo = useLocalVideo;

    return (
      <div
        ref={containerRef}
        className={classnames(styles.videoContainer, {
          [styles.resizing]: resize.isResizing,
          [styles.selected]: isSelected,
          [styles.alignLeft]: align === "left",
          [styles.alignCenter]: align === "center",
          [styles.alignRight]: align === "right",
        })}
        style={{
          width: resize.size.width
            ? `${resize.size.width}px`
            : width
              ? `${width}px`
              : "auto",
          maxWidth: "100%",
        }}
      >
        {shouldUseLocalVideo && Video ? (
          <Video
            ref={videoRef}
            className={styles.video}
            width={"100%"}
            controls
            src={videoUrl}
            playbackRate={playbackRate}
            onClick={handleSelect}
            onLoadedMetadata={handleVideoLoad}
          />
        ) : (
          <video
            ref={videoRef}
            className={styles.video}
            width={"100%"}
            controls
            src={videoUrl}
            onClick={handleSelect}
            onLoadedMetadata={handleVideoLoad}
            style={{ display: "block" }}
          />
        )}
        {!readOnly && isSelected && (
          <>
            {RESIZE_HANDLES.map(({ direction, cursor }) => (
              <div
                key={direction}
                className={classnames(
                  styles.resizeHandle,
                  // @ts-ignore
                  styles[`resize-${direction}`],
                )}
                style={{ cursor }}
                onPointerDown={(e) => resize.handleResizeStart(e, direction)}
              />
            ))}
            {resize.isResizing && (
              <div className={styles.videoInfo}>
                {Math.round(resize.size.width || 0)} px
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderEmpty = () => {
    if (readOnly) return null;
    return (
      <div
        className={classnames(styles.sourcePanel, {
          [styles.dark]: isDark,
        })}
      >
        <div className={styles.panelHeader}>
          <h4>插入视频</h4>
          <p>支持本地上传、网络直链以及 Bilibili / YouTube / Notion 等来源。</p>
        </div>
        <ModernTabs
          variant="flat"
          isDark={isDark}
          items={[
            {
              key: "local",
              label: "本地上传",
              children: (
                <div className={styles.tabCard}>
                  <p className={styles.tabHint}>
                    上传 MP4、WebM、MOV 等格式，单个文件建议不超过 200 MB。
                  </p>
                  <div className={styles.actionsRow}>
                    <Button
                      className={styles.primaryButton}
                      icon={<FolderOpenOutlined />}
                      onClick={() => uploadRef.current?.click()}
                    >
                      选择文件
                    </Button>
                  </div>
                </div>
              ),
            },
            {
              key: "library",
              label: "资源库",
              children: (
                <div className={styles.tabCard}>
                  <p className={styles.tabHint}>
                    引用资源库中已上传的视频，可多选插入到文稿。
                  </p>
                  <div className={styles.actionsRow}>
                    <Button
                      className={styles.secondaryButton}
                      onClick={() => setResourcePickerOpen(true)}
                    >
                      打开资源库
                    </Button>
                  </div>
                </div>
              ),
            },
            {
              key: "url",
              label: "网络地址",
              children: (
                <div className={styles.tabCard}>
                  <p className={styles.tabHint}>
                    支持直接嵌入公网直链视频，建议使用 MP4 或流媒体链接。
                  </p>
                  <div className={styles.inputRow}>
                    <div className={styles.inputWrapper}>
                      <Input
                        prefix={<LinkOutlined className={styles.inputIcon} />}
                        placeholder="https://example.com/video.mp4"
                        value={networkUrl}
                        onChange={(e) => setNetworkUrl(e.target.value)}
                        onPressEnter={handleOnNetworkUrlInputFinish}
                      />
                    </div>
                    <Button
                      className={styles.primaryButton}
                      onClick={handleOnNetworkUrlInputFinish}
                    >
                      插入
                    </Button>
                  </div>
                </div>
              ),
            },
            {
              key: "bilibili",
              label: "Bilibili",
              children: (
                <div className={styles.tabCard}>
                  <p className={styles.tabHint}>
                    从 Bilibili 解析视频并选择清晰度
                  </p>
                  <div className={styles.actionsRow}>
                    <Button
                      className={styles.primaryButton}
                      onClick={() => setBiliModalOpen(true)}
                    >
                      打开 Bilibili 视频选择器
                    </Button>
                  </div>
                </div>
              ),
            },
            {
              key: "youtube",
              label: "YouTube",
              children: (
                <div className={styles.tabCard}>
                  <p className={styles.tabHint}>
                    从 YouTube 解析视频并选择清晰度
                  </p>
                  <div className={styles.actionsRow}>
                    <Button
                      className={styles.primaryButton}
                      onClick={() => setYoutubeModalOpen(true)}
                    >
                      打开 YouTube 视频选择器
                    </Button>
                  </div>
                </div>
              ),
            },
            {
              key: "notion",
              label: "Notion",
              children: (
                <div className={styles.tabCard}>
                  <p className={styles.tabHint}>
                    从 Notion 添加视频块，可选是否缓存到本地
                  </p>
                  <div className={styles.actionsRow}>
                    <Button
                      className={styles.primaryButton}
                      onClick={() => setNotionModalOpen(true)}
                    >
                      打开 Notion 视频选择器
                    </Button>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </div>
    );
  };

  return (
    <div
      contentEditable={false}
      ref={(node) => {
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
        <Spin spinning={uploading}>
          <If condition={!src}>{renderEmpty()}</If>
          <If condition={!!src}>
            <If condition={isBilibili}>
              {biliMeta && BilibiliVideoLoader ? (
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
                    {renderVideoContainer(bilibiliVideoUrl as string)}
                  </If>
                </>
              ) : (
                <div style={{ color: "#ff4d4f", padding: 8 }}>
                  缺少 Bilibili metaInfo，请通过添加视频入口创建
                </div>
              )}
            </If>

            <If condition={isYoutube}>
              {ytMeta && YoutubeVideoLoader ? (
                <>
                  <YoutubeVideoLoader
                    loading={youtubeLoading}
                    error={youtubeError}
                    streamProgress={youtubeProgress}
                  />
                  <If
                    condition={
                      !!youtubeVideoUrl && !youtubeLoading && !youtubeError
                    }
                  >
                    {renderVideoContainer(youtubeVideoUrl as string)}
                  </If>
                </>
              ) : (
                <div style={{ color: "#ff4d4f", padding: 8 }}>
                  缺少 YouTube metaInfo，请通过添加视频入口创建
                </div>
              )}
            </If>

            <If condition={isNotion}>
              {notionMeta && NotionVideoLoader ? (
                <>
                  <NotionVideoLoader
                    loading={notionVideoLoading}
                    error={notionVideoError}
                    streamProgress={notionProgress}
                  />
                  <If
                    condition={
                      !!notionVideoUrl &&
                      !notionVideoLoading &&
                      !notionVideoError
                    }
                  >
                    {renderVideoContainer(
                      notionVideoUrl as string,
                      (notionMeta as any).cache !== false,
                    )}
                  </If>
                </>
              ) : (
                <div style={{ color: "#ff4d4f", padding: 8 }}>
                  缺少 Notion metaInfo，请通过添加视频入口创建
                </div>
              )}
            </If>

            <If condition={!isBilibili && !isYoutube && !isNotion}>
              {isRegularRemoteVideo && RemoteVideoLoader ? (
                <>
                  <RemoteVideoLoader
                    loading={remoteVideoLoading}
                    error={remoteVideoError}
                    streamProgress={remoteVideoProgress}
                  />
                  <If
                    condition={
                      !!remoteVideoUrl &&
                      !remoteVideoLoading &&
                      !remoteVideoError
                    }
                  >
                    {renderVideoContainer(remoteVideoUrl as string, false)}
                  </If>
                </>
              ) : (
                renderVideoContainer(src, shouldUseLocalVideoCache(src))
              )}
            </If>
          </If>
        </Spin>
        {children}
        <div
          contentEditable={false}
          ref={(node) => {
            drag(node);
          }}
          className={classnames(styles.dragHandler, {
            [styles.canDrag]: canDrag,
          })}
          onClick={dragHandlerProps.onClick}
        >
          <MdDragIndicator className={styles.icon} />
        </div>
        <EditorContextMenu {...menuProps} readonly={readOnly} />
        <input
          ref={uploadRef}
          type={"file"}
          accept={"video/*"}
          hidden
          onChange={handleUploadFileChange}
        />
        {!(readOnly && isLast) && <AddParagraph element={element} />}
      </div>
      {ResourcePickerModal && (
        <ResourcePickerModal
          open={resourcePickerOpen}
          onCancel={() => setResourcePickerOpen(false)}
          allowedTypes={["video"]}
          multiple
          title="选择视频"
          onConfirm={handleInsertFromResource}
        />
      )}

      {/* Bilibili 视频选择弹窗 */}
      {BilibiliVideoSelectModal && (
        <BilibiliVideoSelectModal
          open={biliModalOpen}
          onCancel={() => setBiliModalOpen(false)}
          onConfirm={handleBilibiliConfirm}
        />
      )}

      {/* YouTube 视频选择弹窗 */}

      {YoutubeVideoSelectModal && (
        <YoutubeVideoSelectModal
          open={youtubeModalOpen}
          onCancel={() => setYoutubeModalOpen(false)}
          onConfirm={handleYoutubeConfirm}
        />
      )}

      {/* Notion 视频选择弹窗 */}
      {NotionVideoSelectModal && (
        <NotionVideoSelectModal
          open={notionModalOpen}
          onCancel={() => setNotionModalOpen(false)}
          onConfirm={handleNotionConfirm}
        />
      )}
    </div>
  );
};

export default VideoComponent;
