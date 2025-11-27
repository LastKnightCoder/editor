import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { ReactEditor, useReadOnly, useSlateStatic } from "slate-react";
import { Transforms, Path } from "slate";
import {
  Button,
  Flex,
  Input,
  Spin,
  App,
  Modal,
  Select,
  Switch,
  Tag,
} from "antd";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";
import {
  LoadingOutlined,
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
} from "@ant-design/icons";

import { IExtensionBaseProps } from "@editor/extensions/types.ts";
import { VideoElement } from "@editor/types";
import AddParagraph from "@editor/components/AddParagraph";
import { EditorContext } from "@editor/index.tsx";
import useDragAndDrop from "@editor/hooks/useDragAndDrop.ts";
import {
  useImageResize,
  ResizeDirection,
} from "@editor/hooks/useImageResize.ts";
import useIsLastElement from "@/components/Editor/hooks/useIsLastElement.ts";

import LocalVideo from "@/components/LocalVideo";
import If from "@/components/If";
import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import NotionVideoLoader from "@/components/NotionVideoLoader";
import ResourcePickerModal from "@/components/ResourcePickerModal";
import ModernTabs from "@/components/ModernTabs";
import { useBilibiliVideo } from "@/hooks/useBilibiliVideo";
import { useYoutubeVideo } from "@/hooks/useYoutubeVideo";
import { useNotionVideo } from "@/hooks/useNotionVideo";
import { isYoutubeUrl } from "@/utils/youtube/parser";
import { parseNotionBlockId } from "@/utils/notion";
import { getNotionBlockInfo } from "@/commands/notion";
import {
  isBilibiliUrl,
  quickCheckBilibiliUrl,
  getVideoInfoByUrl,
  getQualityInfo,
  getQualityOptions,
  BilibiliVideoQuality,
} from "@/utils/bilibili";
import { getYoutubeVideoInfo } from "@/commands/youtube-cache";
import useSettingStore from "@/stores/useSettingStore";
import type {
  IResource,
  BiliBiliVideoMetaInfo,
  YouTubeVideoMetaInfo,
  NotionVideoMetaInfo,
  LocalVideoMetaInfo,
  RemoteVideoMetaInfo,
  YoutubeVideoInfo,
  StreamOption,
} from "@/types";

import styles from "./index.module.less";
import useTheme from "@/components/Editor/hooks/useTheme";
import { LinkOutlined, FolderOpenOutlined } from "@ant-design/icons";

function isBiliMetaInfo(
  m?:
    | BiliBiliVideoMetaInfo
    | YouTubeVideoMetaInfo
    | NotionVideoMetaInfo
    | LocalVideoMetaInfo
    | RemoteVideoMetaInfo,
): m is BiliBiliVideoMetaInfo {
  return !!m && (m as BiliBiliVideoMetaInfo).type === "bilibili";
}

function isYoutubeMetaInfo(
  m?:
    | BiliBiliVideoMetaInfo
    | YouTubeVideoMetaInfo
    | NotionVideoMetaInfo
    | LocalVideoMetaInfo
    | RemoteVideoMetaInfo,
): m is YouTubeVideoMetaInfo {
  return !!m && (m as YouTubeVideoMetaInfo).type === "youtube";
}

function isNotionMetaInfo(
  m?:
    | BiliBiliVideoMetaInfo
    | YouTubeVideoMetaInfo
    | NotionVideoMetaInfo
    | LocalVideoMetaInfo
    | RemoteVideoMetaInfo,
): m is NotionVideoMetaInfo {
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

  // 添加 Bilibili/Youtube 解析弹窗状态
  const [biliModalOpen, setBiliModalOpen] = useState(false);
  const [biliUrl, setBiliUrl] = useState("");
  const [biliLoading, setBiliLoading] = useState(false);
  const [bilibiliQualityOptions, setBilibiliQualityOptions] = useState<
    Array<{
      label: string;
      value: number;
      needLogin?: boolean;
      needVip?: boolean;
    }>
  >([]);
  const [selectedBilibiliQuality, setSelectedBilibiliQuality] =
    useState<number>(BilibiliVideoQuality.HD_1080P);
  const [bilibiliQualityLoading, setBilibiliQualityLoading] = useState(false);
  const biliDebounceRef = useRef<number | null>(null);

  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeCreateLoading, setYoutubeCreateLoading] = useState(false);
  const [youtubeVideoInfo, setYoutubeVideoInfo] =
    useState<YoutubeVideoInfo | null>(null);
  const [youtubeVideoInfoLoading, setYoutubeVideoInfoLoading] = useState(false);
  const [youtubeSelectedVideoStream, setYoutubeSelectedVideoStream] = useState<
    StreamOption | undefined
  >(undefined);
  const [youtubeSelectedAudioStream, setYoutubeSelectedAudioStream] = useState<
    StreamOption | undefined
  >(undefined);
  const ytDebounceRef = useRef<number | null>(null);

  const [notionInput, setNotionInput] = useState("");
  const [notionLoading, setNotionLoading] = useState(false);
  const [notionCacheEnabled, setNotionCacheEnabled] = useState(false);
  const { isDark } = useTheme();

  const setting = useSettingStore.getState().setting;

  const isBilibili = useMemo(
    () => !!element.src && isBilibiliUrl(element.src),
    [element.src],
  );
  const isYoutube = useMemo(
    () => !!element.src && isYoutubeUrl(element.src),
    [element.src],
  );
  const isNotion = useMemo(() => {
    return isNotionMetaInfo(element.metaInfo);
  }, [element.metaInfo]);

  const biliMeta = isBiliMetaInfo(element.metaInfo)
    ? (element.metaInfo as BiliBiliVideoMetaInfo)
    : null;
  const ytMeta = isYoutubeMetaInfo(element.metaInfo)
    ? (element.metaInfo as YouTubeVideoMetaInfo)
    : undefined;
  const notionMeta = isNotionMetaInfo(element.metaInfo)
    ? (element.metaInfo as NotionVideoMetaInfo)
    : undefined;

  const {
    videoUrl: bilibiliVideoUrl,
    loading: bilibiliLoading,
    error: bilibiliError,
    streamProgress: bilibiliProgress,
  } = useBilibiliVideo(
    biliMeta ||
      ({
        type: "other",
        bvid: "",
        cid: "",
      } as unknown as BiliBiliVideoMetaInfo),
  );

  const {
    videoUrl: youtubeVideoUrl,
    loading: youtubeLoading,
    error: youtubeError,
    streamProgress: youtubeProgress,
  } = useYoutubeVideo(ytMeta);

  const {
    videoUrl: notionVideoUrl,
    loading: notionVideoLoading,
    error: notionVideoError,
    streamProgress: notionProgress,
  } = useNotionVideo(notionMeta);

  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } =
    useDragAndDrop({
      element,
    });

  const { uploadResource: uploadFile } = useContext(EditorContext) || {};

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
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(
        editor,
        {
          src: first.path,
          uploading: false,
          metaInfo: undefined,
        },
        { at: path },
      );

      let referencePath = path;
      rest.forEach((resource) => {
        referencePath = Path.next(referencePath);
        Transforms.insertNodes(
          editor,
          {
            type: "video",
            src: resource.path,
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

  const fetchBilibiliQualityOptions = useMemoizedFn(async (url: string) => {
    if (!url.trim() || !isBilibiliUrl(url)) {
      setBilibiliQualityOptions([]);
      return;
    }
    if (bilibiliQualityLoading) return;
    setBilibiliQualityLoading(true);
    try {
      const credentials = setting.integration.bilibili.credentials;
      const videoInfo = await getVideoInfoByUrl(url, credentials);
      const qualityInfo = await getQualityInfo(
        videoInfo.cid,
        videoInfo.bvid,
        credentials,
      );
      const options = getQualityOptions(qualityInfo.accept_quality);
      setBilibiliQualityOptions(options);

      const hasLogin = !!credentials.SESSDATA;
      const hasVip =
        !!setting.integration.bilibili.userInfo.vipStatus && hasLogin;
      let defaultQuality: number;
      if (hasVip) {
        defaultQuality = options[0]?.value || BilibiliVideoQuality.HD_1080P;
      } else if (hasLogin) {
        const maxQuality = Math.max(
          ...options
            .filter((opt) => opt.value <= BilibiliVideoQuality.HD_1080P)
            .map((opt) => opt.value),
        );
        defaultQuality = maxQuality || BilibiliVideoQuality.HD_720P;
      } else {
        const maxQuality = Math.max(
          ...options
            .filter((opt) => opt.value <= BilibiliVideoQuality.HD_720P)
            .map((opt) => opt.value),
        );
        defaultQuality = maxQuality || BilibiliVideoQuality.CLEAR_480P;
      }
      setSelectedBilibiliQuality(defaultQuality);
    } catch (e) {
      setBilibiliQualityOptions([
        { label: "480P 清晰", value: BilibiliVideoQuality.CLEAR_480P },
        { label: "720P 高清", value: BilibiliVideoQuality.HD_720P },
        {
          label: "1080P 高清",
          value: BilibiliVideoQuality.HD_1080P,
          needLogin: true,
        },
      ]);
      setSelectedBilibiliQuality(BilibiliVideoQuality.HD_720P);
    } finally {
      setBilibiliQualityLoading(false);
    }
  });

  const handleBiliUrlChange = useMemoizedFn((url: string) => {
    setBiliUrl(url);
    if (biliDebounceRef.current) {
      window.clearTimeout(biliDebounceRef.current);
    }
    if (!url.trim()) {
      setBilibiliQualityOptions([]);
      return;
    }
    biliDebounceRef.current = window.setTimeout(() => {
      if (isBilibiliUrl(url)) {
        fetchBilibiliQualityOptions(url);
      }
    }, 800);
  });

  const handleConfirmBilibili = useMemoizedFn(async () => {
    if (!biliUrl || !isBilibiliUrl(biliUrl)) {
      message.error("请输入有效的 Bilibili 链接");
      return;
    }
    setBiliLoading(true);
    try {
      const quick = await quickCheckBilibiliUrl(biliUrl);
      if (!quick.isValid || !quick.bvid) {
        message.error(quick.error || "无效的 Bilibili 链接");
        return;
      }
      // 获取 cid（以及可选质量信息）
      const info = await getVideoInfoByUrl(
        biliUrl,
        setting.integration.bilibili.credentials,
      );
      let cid = info.cid;
      const p = new URL(biliUrl).searchParams.get("p");
      if (p && info.pages) {
        const page = info.pages[Number(p) - 1];
        cid = page.cid;
      }
      const meta: BiliBiliVideoMetaInfo = {
        type: "bilibili",
        bvid: info.bvid,
        cid: cid,
        quality: selectedBilibiliQuality,
      };

      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(
        editor,
        {
          src: biliUrl,
          metaInfo: meta,
        },
        { at: path },
      );

      setBiliModalOpen(false);
      setBiliUrl("");
      setBilibiliQualityOptions([]);
    } catch (e) {
      message.error("解析 Bilibili 信息失败");
      // 保持弹窗以便用户修改
    } finally {
      setBiliLoading(false);
    }
  });

  // 解析并写入YouTube metaInfo
  const handleConfirmYoutube = useMemoizedFn(async () => {
    if (!youtubeUrl || !isYoutubeUrl(youtubeUrl)) {
      message.error("请输入有效的 YouTube 链接");
      return;
    }
    if (!youtubeSelectedVideoStream || !youtubeSelectedAudioStream) {
      message.error("请选择清晰度");
      return;
    }
    setYoutubeCreateLoading(true);
    try {
      const meta: YouTubeVideoMetaInfo = {
        type: "youtube",
        url: youtubeUrl,
        videoStream: youtubeSelectedVideoStream,
        audioStream: youtubeSelectedAudioStream,
      } as const;

      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(
        editor,
        {
          src: youtubeUrl,
          metaInfo: meta,
        },
        { at: path },
      );

      setYoutubeModalOpen(false);
      setYoutubeUrl("");
      setYoutubeVideoInfo(null);
      setYoutubeSelectedVideoStream(undefined);
      setYoutubeSelectedAudioStream(undefined);
    } catch (e) {
      message.error("解析 YouTube 信息失败");
    } finally {
      setYoutubeCreateLoading(false);
    }
  });

  // 根据输入 YouTube URL 获取可用清晰度
  const handleYoutubeUrlChange = useMemoizedFn(async (url: string) => {
    setYoutubeUrl(url);
    if (ytDebounceRef.current) {
      window.clearTimeout(ytDebounceRef.current);
    }
    if (!url.trim()) {
      setYoutubeVideoInfo(null);
      setYoutubeSelectedVideoStream(undefined);
      setYoutubeSelectedAudioStream(undefined);
      return;
    }
    ytDebounceRef.current = window.setTimeout(async () => {
      setYoutubeVideoInfoLoading(true);
      try {
        const info = await getYoutubeVideoInfo(
          url,
          setting.integration.youtube.proxy,
        );
        setYoutubeVideoInfo(info);
        setYoutubeSelectedVideoStream(info?.videoStreams?.[0]);
        setYoutubeSelectedAudioStream(info?.audioStreams?.[0]);
      } catch (e) {
        message.error("获取视频信息失败");
        setYoutubeVideoInfo(null);
        setYoutubeSelectedVideoStream(undefined);
        setYoutubeSelectedAudioStream(undefined);
      } finally {
        setYoutubeVideoInfoLoading(false);
      }
    }, 800);
  });

  const handleConfirmNotion = useMemoizedFn(async () => {
    if (!notionInput.trim()) {
      message.error("请输入 Notion 视频区块 ID 或链接");
      return;
    }

    setNotionLoading(true);

    try {
      const blockId = parseNotionBlockId(notionInput);
      if (!blockId) {
        message.error("无法解析 Block ID，请检查输入格式");
        setNotionLoading(false);
        return;
      }

      const token = setting.integration.notion.token;
      if (!token || !setting.integration.notion.enabled) {
        message.error("请先在设置中配置 Notion 集成");
        setNotionLoading(false);
        return;
      }

      const blockInfo = await getNotionBlockInfo(token, blockId);
      if (!blockInfo.success) {
        message.error(blockInfo.error || "获取 Notion 区块信息失败");
        setNotionLoading(false);
        return;
      }

      if (blockInfo.blockType !== "video") {
        message.error(`该区块不是视频类型，而是 ${blockInfo.blockType} 类型`);
        setNotionLoading(false);
        return;
      }

      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes<VideoElement>(
        editor,
        {
          metaInfo: {
            type: "notion",
            blockId,
            cache: notionCacheEnabled,
          } as NotionVideoMetaInfo,
          src: `notion://${blockId}`,
        },
        { at: path },
      );

      setNotionInput("");
      message.success("Notion 视频添加成功");
    } catch (error) {
      console.error("添加 Notion 视频失败:", error);
      message.error("添加 Notion 视频失败，请检查 Block ID 是否正确");
    } finally {
      setNotionLoading(false);
    }
  });

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

  const toggleAlign = useMemoizedFn(() => {
    if (readOnly) return;
    const path = ReactEditor.findPath(editor, element);
    let newAlign: "left" | "center" | "right";

    // 循环切换：left -> center -> right -> left
    if (align === "left") {
      newAlign = "center";
    } else if (align === "center") {
      newAlign = "right";
    } else {
      newAlign = "left";
    }

    Transforms.setNodes(
      editor,
      {
        align: newAlign,
      },
      {
        at: path,
      },
    );
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
  const renderVideoContainer = (videoUrl: string) => {
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
        <LocalVideo
          ref={videoRef}
          className={styles.video}
          width={"100%"}
          controls
          src={videoUrl}
          playbackRate={playbackRate}
          onClick={handleSelect}
          onLoadedMetadata={handleVideoLoad}
        />
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
        <div className={styles.actions}>
          <div
            onClick={toggleAlign}
            className={styles.item}
            title={
              align === "left"
                ? "居中对齐"
                : align === "center"
                  ? "右对齐"
                  : "左对齐"
            }
          >
            {align === "left" && <AlignLeftOutlined />}
            {align === "center" && <AlignCenterOutlined />}
            {align === "right" && <AlignRightOutlined />}
          </div>
        </div>
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
                    输入 Bilibili 视频链接，选择清晰度后插入。
                  </p>
                  <Flex vertical gap={12}>
                    <Input
                      placeholder="https://www.bilibili.com/video/BV..."
                      value={biliUrl}
                      onChange={(e) => handleBiliUrlChange(e.target.value)}
                      suffix={
                        isBilibiliUrl(biliUrl) && bilibiliQualityLoading ? (
                          <LoadingOutlined />
                        ) : undefined
                      }
                      className="h-10"
                    />
                    {isBilibiliUrl(biliUrl) &&
                      bilibiliQualityOptions.length > 0 && (
                        <Select
                          style={{ width: "100%" }}
                          value={selectedBilibiliQuality}
                          onChange={setSelectedBilibiliQuality}
                        >
                          {bilibiliQualityOptions.map((opt) => (
                            <Select.Option key={opt.value} value={opt.value}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                }}
                              >
                                <span>{opt.label}</span>
                                <div>
                                  {opt.needVip && (
                                    <Tag color="gold">大会员</Tag>
                                  )}
                                  {opt.needLogin && !opt.needVip && (
                                    <Tag color="blue">需登录</Tag>
                                  )}
                                </div>
                              </div>
                            </Select.Option>
                          ))}
                        </Select>
                      )}
                    <Button
                      className={styles.primaryButton}
                      loading={biliLoading}
                      onClick={handleConfirmBilibili}
                    >
                      添加
                    </Button>
                  </Flex>
                </div>
              ),
            },
            {
              key: "youtube",
              label: "YouTube",
              children: (
                <div className={styles.tabCard}>
                  <p className={styles.tabHint}>
                    解析 YouTube 链接，选择音视频清晰度。
                  </p>
                  <Flex vertical gap={12}>
                    <Input
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={(e) => handleYoutubeUrlChange(e.target.value)}
                      suffix={
                        isYoutubeUrl(youtubeUrl) && youtubeVideoInfoLoading ? (
                          <LoadingOutlined />
                        ) : undefined
                      }
                      className="h-10"
                    />
                    {isYoutubeUrl(youtubeUrl) && youtubeVideoInfo && (
                      <>
                        <Select
                          style={{ width: "100%" }}
                          options={youtubeVideoInfo.audioStreams.map((f) => ({
                            label: `${f.resolution || ""} / ${f.format || ""}`,
                            value: f.id,
                          }))}
                          value={youtubeSelectedAudioStream?.id}
                          onChange={(id) =>
                            setYoutubeSelectedAudioStream(
                              youtubeVideoInfo.audioStreams.find(
                                (f) => f.id === id,
                              ) as StreamOption,
                            )
                          }
                          placeholder="选择音频清晰度"
                        />
                        <Select
                          style={{ width: "100%" }}
                          options={youtubeVideoInfo.videoStreams.map((f) => ({
                            label: `${f.resolution || ""} / ${f.format || ""}`,
                            value: f.id,
                          }))}
                          value={youtubeSelectedVideoStream?.id}
                          onChange={(id) =>
                            setYoutubeSelectedVideoStream(
                              youtubeVideoInfo.videoStreams.find(
                                (f) => f.id === id,
                              ) as StreamOption,
                            )
                          }
                          placeholder="选择视频清晰度"
                        />
                      </>
                    )}
                    <Button
                      className={styles.primaryButton}
                      disabled={
                        !isYoutubeUrl(youtubeUrl) ||
                        !youtubeSelectedVideoStream ||
                        !youtubeSelectedAudioStream
                      }
                      loading={youtubeCreateLoading}
                      onClick={handleConfirmYoutube}
                    >
                      添加
                    </Button>
                  </Flex>
                </div>
              ),
            },
            {
              key: "notion",
              label: "Notion",
              children: (
                <div className={styles.tabCard}>
                  <p className={styles.tabHint}>
                    支持直接引用 Notion 视频块，可按需缓存到本地。
                  </p>
                  <Flex vertical gap={12}>
                    <Input.TextArea
                      rows={4}
                      value={notionInput}
                      onChange={(e) => setNotionInput(e.target.value)}
                      placeholder={`请输入 Notion 视频区块 ID 或链接，例如：\n- 3b628e1d-84da-4c6c-900d-b6e4a28532e1\n- https://www.notion.so/...#3b628e1d84da4c6c900db6e4a28532e1`}
                    />
                    <Flex align="center" gap={8}>
                      <span>缓存视频到本地</span>
                      <Switch
                        checked={notionCacheEnabled}
                        onChange={setNotionCacheEnabled}
                        checkedChildren="开启"
                        unCheckedChildren="关闭"
                      />
                    </Flex>
                    <Button
                      className={styles.primaryButton}
                      loading={notionLoading}
                      onClick={handleConfirmNotion}
                    >
                      添加
                    </Button>
                  </Flex>
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
      ref={drop}
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
              {biliMeta ? (
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
              {ytMeta ? (
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
              {notionMeta ? (
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
                    {renderVideoContainer(notionVideoUrl as string)}
                  </If>
                </>
              ) : (
                <div style={{ color: "#ff4d4f", padding: 8 }}>
                  缺少 Notion metaInfo，请通过添加视频入口创建
                </div>
              )}
            </If>

            <If condition={!isBilibili && !isYoutube && !isNotion}>
              {renderVideoContainer(src)}
            </If>
          </If>
        </Spin>
        {children}
        <div
          contentEditable={false}
          ref={drag}
          className={classnames(styles.dragHandler, {
            [styles.canDrag]: canDrag,
          })}
        >
          <MdDragIndicator className={styles.icon} />
        </div>
        <input
          ref={uploadRef}
          type={"file"}
          accept={"video/*"}
          hidden
          onChange={handleUploadFileChange}
        />
        {!(readOnly && isLast) && <AddParagraph element={element} />}
      </div>
      <ResourcePickerModal
        open={resourcePickerOpen}
        onCancel={() => setResourcePickerOpen(false)}
        allowedTypes={["video"]}
        multiple
        title="选择视频"
        onConfirm={handleInsertFromResource}
      />

      {/* Bilibili 地址输入弹窗 */}
      <Modal
        open={biliModalOpen}
        title={"添加 Bilibili 视频"}
        confirmLoading={biliLoading}
        onCancel={() => {
          setBiliModalOpen(false);
          setBiliUrl("");
          setBilibiliQualityOptions([]);
        }}
        onOk={handleConfirmBilibili}
      >
        <div style={{ marginBottom: 12 }}>
          <Input
            placeholder="请输入Bilibili 链接 (https://www.bilibili.com/video/BV...)"
            value={biliUrl}
            onChange={(e) => handleBiliUrlChange(e.target.value)}
            suffix={bilibiliQualityLoading ? <LoadingOutlined /> : undefined}
            autoFocus
          />
        </div>
        {bilibiliQualityOptions.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ marginBottom: 6 }}>选择清晰度</div>
            <Select
              style={{ width: "100%" }}
              value={selectedBilibiliQuality}
              onChange={setSelectedBilibiliQuality}
              disabled={bilibiliQualityLoading}
              loading={bilibiliQualityLoading}
              placeholder="选择清晰度"
            >
              {bilibiliQualityOptions.map((opt) => (
                <Select.Option key={opt.value} value={opt.value}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>{opt.label}</span>
                    <div>
                      {opt.needVip && <Tag color="gold">大会员</Tag>}
                      {opt.needLogin && !opt.needVip && (
                        <Tag color="blue">需登录</Tag>
                      )}
                    </div>
                  </div>
                </Select.Option>
              ))}
            </Select>
            <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 4 }}>
              * 高清晰度可能需要登录或大会员权限
            </div>
          </div>
        )}
      </Modal>

      {/* YouTube 地址输入弹窗 */}
      <Modal
        open={youtubeModalOpen}
        title={"添加 YouTube 视频"}
        confirmLoading={youtubeCreateLoading}
        onCancel={() => {
          setYoutubeModalOpen(false);
          setYoutubeUrl("");
          setYoutubeVideoInfo(null);
          setYoutubeSelectedVideoStream(undefined);
          setYoutubeSelectedAudioStream(undefined);
        }}
        onOk={handleConfirmYoutube}
        okButtonProps={{
          disabled: !youtubeSelectedVideoStream || !youtubeSelectedAudioStream,
        }}
      >
        <Input
          placeholder="请输入YouTube 链接 (https://www.youtube.com/watch?v=...)"
          value={youtubeUrl}
          onChange={(e) => handleYoutubeUrlChange(e.target.value)}
          autoFocus
        />
        {youtubeVideoInfo?.audioStreams?.length &&
        youtubeVideoInfo?.videoStreams?.length ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 6 }}>选择音频清晰度</div>
            <Select
              style={{ width: "100%" }}
              options={youtubeVideoInfo.audioStreams.map((f) => ({
                label: `${f.resolution || ""} / ${f.format || ""}`,
                value: f.id,
              }))}
              value={youtubeSelectedAudioStream?.id}
              loading={youtubeVideoInfoLoading}
              onChange={(id) =>
                setYoutubeSelectedAudioStream(
                  youtubeVideoInfo.audioStreams.find(
                    (f) => f.id === id,
                  ) as StreamOption,
                )
              }
              placeholder="选择清晰度"
            />
            <div style={{ marginTop: 6 }}>选择视频清晰度</div>
            <Select
              style={{ width: "100%" }}
              options={youtubeVideoInfo.videoStreams.map((f) => ({
                label: `${f.resolution || ""} / ${f.format || ""}`,
                value: f.id,
              }))}
              value={youtubeSelectedVideoStream?.id}
              loading={youtubeVideoInfoLoading}
              onChange={(id) =>
                setYoutubeSelectedVideoStream(
                  youtubeVideoInfo.videoStreams.find(
                    (f) => f.id === id,
                  ) as StreamOption,
                )
              }
              placeholder="选择清晰度"
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default VideoComponent;
