import { useEffect, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { ReactEditor, useReadOnly, useSlateStatic } from "slate-react";
import { Transforms } from "slate";
import { LoadingOverlay, cn } from "@tau/ui";

import { IExtensionBaseProps } from "../../../../extensions/types";
import type { VideoElement } from "../../../../types";
import AddParagraph from "../../../../components/AddParagraph";
import { useImageResize, ResizeDirection } from "../../../../hooks/useImageResize";
import useIsLastElement from "../../../../hooks/useIsLastElement";

import { If, VideoPlayer } from "@tau/shared";

import {
  IVideoContentProviders,
  useEditorSlots,
  useNotifier,
  useOptionalService,
} from "../../../../services";
import { openLocalMediaPicker } from "../../../../utils/mediaInsert";
import {
  MEDIA_ALIGN_CLASS,
  MEDIA_CORNER_HANDLE_CLASS,
  MEDIA_CORNER_POSITION_CLASS,
  MEDIA_RESIZE_INFO_CLASS,
} from "../../../../utils/mediaFrameClasses";
import VideoSelectionToolbar, { WIDTH_PRESETS } from "./VideoSelectionToolbar";

const MIN_WIDTH = 200;

/** 从地址里取文件名作为无标题视频的显示名 */
const fileNameOf = (src: string) => {
  const path = src.split(/[?#]/)[0];
  const name = path.split(/[\\/]/).filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

const VideoComponent = (props: IExtensionBaseProps<VideoElement>) => {
  const { element, children, attributes } = props;
  const readOnly = useReadOnly();
  const isLast = useIsLastElement(element);
  const editor = useSlateStatic();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [maxWidth, setMaxWidth] = useState<number>(Infinity);
  const [isSelected, setIsSelected] = useState(false);
  const { Video } = useEditorSlots();
  const notifier = useNotifier();
  const videoProviders = useOptionalService(IVideoContentProviders) ?? [];

  const matchedProvider = useMemo(
    () => videoProviders.find(provider => provider.match(element)),
    [videoProviders, element]
  );

  const { src, uploading, playbackRate = 1, width, align = "center" } = element;

  // 底栏信息位：「来源 · 标题」，无标题的直链 / 本地文件退回文件名
  const info = useMemo(() => {
    const title = typeof element.metaInfo?.title === "string" ? element.metaInfo.title : undefined;
    const parts = [
      matchedProvider?.label,
      title ?? (matchedProvider ? undefined : fileNameOf(src)),
    ];
    const text = parts.filter(Boolean).join(" · ");
    return text ? <span className="truncate">{text}</span> : undefined;
  }, [element.metaInfo, matchedProvider, src]);

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

  const getEditorWidth = useMemoizedFn(() => {
    const editorEl = containerRef.current?.closest(
      '[data-slate-editor="true"]'
    ) as HTMLElement | null;
    return editorEl?.clientWidth ?? 0;
  });

  // 计算编辑器可用最大宽度
  useEffect(() => {
    const editorWidth = getEditorWidth();
    if (editorWidth) {
      setMaxWidth(editorWidth);
    }
  }, [getEditorWidth]);

  const setElementProps = useMemoizedFn((props: Partial<VideoElement>) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, props, { at: path });
  });

  const updateElementWidth = useMemoizedFn((newWidth?: number) => {
    if (typeof newWidth !== "number") return;
    setElementProps({ width: newWidth });
  });

  // 捕获阶段选中：暂停态的播放覆盖层、底栏按钮上按下同样算选中本块
  const handleSelect = useMemoizedFn(() => {
    if (!readOnly) {
      setIsSelected(true);
    }
  });

  const presetWidth = (ratio: number) => {
    const available = getEditorWidth() || maxWidth;
    return Number.isFinite(available) ? Math.max(MIN_WIDTH, Math.round(available * ratio)) : 0;
  };

  const handleWidthPreset = useMemoizedFn((ratio: number) => {
    const next = presetWidth(ratio);
    resize.setSize({ width: next });
    updateElementWidth(next);
  });

  const handleCopyLink = useMemoizedFn(() => {
    navigator.clipboard
      .writeText(src)
      .then(() => notifier.success("视频地址已复制"))
      .catch(() => notifier.error("复制失败"));
  });

  const handlePlaybackRateChange = useMemoizedFn((rate: number) => {
    if (!readOnly) {
      setElementProps({ playbackRate: rate });
    }
  });

  const handleVideoLoad = useMemoizedFn(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      const videoNaturalWidth = video.videoWidth;
      const videoNaturalHeight = video.videoHeight;
      setNaturalSize({ width: videoNaturalWidth, height: videoNaturalHeight });

      if (!width) {
        const editorEl = containerRef.current?.closest(
          '[data-slate-editor="true"]'
        ) as HTMLElement | null;
        const editorWidth = editorEl?.clientWidth || 0;
        const initialWidth = Math.min(videoNaturalWidth, editorWidth || videoNaturalWidth);
        updateElementWidth(initialWidth);
        resize.setSize({ width: initialWidth });
      }
    }
  });

  const resize = useImageResize({
    initialSize: { width },
    minWidth: MIN_WIDTH,
    maxWidth,
    minHeight: 100,
    aspectRatio:
      naturalSize.width && naturalSize.height ? naturalSize.width / naturalSize.height : undefined,
    onResizeEnd: size => {
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

  // 包裹视频的容器，添加调整大小功能；也是业务内容源解析出地址后的通用播放入口
  const renderPlayback = (videoUrl: string, useLocalVideo = true) => {
    const currentWidth = resize.size.width ?? width;
    const activePreset =
      currentWidth == null
        ? null
        : (WIDTH_PRESETS.find(ratio => Math.abs(presetWidth(ratio) - currentWidth) <= 2) ?? null);
    const playerProps = {
      ref: videoRef,
      className: "w-full cursor-default",
      src: videoUrl,
      playbackRate,
      onPlaybackRateChange: handlePlaybackRateChange,
      info,
      onLoadedMetadata: handleVideoLoad,
    };

    return (
      <div
        ref={containerRef}
        className={cn(
          "rounded-tau-md relative my-0 block w-fit max-w-full",
          MEDIA_ALIGN_CLASS[align],
          isSelected &&
            !readOnly &&
            "outline-solid outline-2 outline-offset-[3px] outline-[var(--ed-accent)]"
        )}
        style={{
          width: resize.size.width ? `${resize.size.width}px` : width ? `${width}px` : "auto",
          maxWidth: "100%",
        }}
        onPointerDownCapture={handleSelect}
      >
        {!readOnly && isSelected && (
          <VideoSelectionToolbar
            align={align}
            activePreset={activePreset}
            onAlign={next => setElementProps({ align: next })}
            onWidthPreset={handleWidthPreset}
            onCopyLink={handleCopyLink}
          />
        )}
        {useLocalVideo ? (
          <Video {...playerProps} controls />
        ) : (
          // 流式地址每次解析都会变，续播按节点的原始地址记忆
          <VideoPlayer {...playerProps} persistKey={src} />
        )}
        {!readOnly && isSelected && (
          <>
            {RESIZE_HANDLES.map(({ direction, cursor }) => (
              <div
                key={direction}
                className={cn(MEDIA_CORNER_HANDLE_CLASS, MEDIA_CORNER_POSITION_CLASS[direction])}
                style={{ cursor }}
                onPointerDown={e => resize.handleResizeStart(e, direction)}
              />
            ))}
            {resize.isResizing && (
              <div className={MEDIA_RESIZE_INFO_CLASS}>{Math.round(resize.size.width || 0)} px</div>
            )}
          </>
        )}
      </div>
    );
  };

  // 遗留空视频元素的最小占位（正常流程经 slash 菜单直接创建已填充的元素）
  const renderEmpty = () => {
    if (readOnly) return null;
    return (
      <div className="flex items-center justify-center gap-[0.5em] rounded-[0.75em] border border-dashed border-gray-300 p-[1.5em] text-[0.875em] text-gray-500 dark:border-zinc-700 dark:text-zinc-400">
        {uploading ? (
          <span>视频上传中...</span>
        ) : (
          <>
            <span>空视频，</span>
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 font-semibold text-[var(--ed-text-inverse)] underline-offset-2 hover:underline"
              onClick={() => openLocalMediaPicker(editor, "video", element)}
            >
              选择文件
            </button>
            <span>上传</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div contentEditable={false} className="relative">
      <div {...attributes}>
        <LoadingOverlay loading={!!uploading}>
          <If condition={!src}>{renderEmpty()}</If>
          <If condition={!!src}>
            {matchedProvider ? (
              <matchedProvider.Content
                element={element}
                readOnly={readOnly}
                renderPlayback={renderPlayback}
              />
            ) : (
              renderPlayback(src)
            )}
          </If>
        </LoadingOverlay>
        {children}
        {!(readOnly && isLast) && <AddParagraph element={element} />}
      </div>
    </div>
  );
};

export default VideoComponent;
