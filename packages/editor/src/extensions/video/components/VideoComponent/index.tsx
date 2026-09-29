import React, { useEffect, useMemo, useRef, useState } from "react";
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

import { IVideoContentProviders, useEditorSlots, useOptionalService } from "../../../../services";
import { openLocalMediaPicker } from "../../../../utils/mediaInsert";
import {
  MEDIA_ALIGN_CLASS,
  MEDIA_CORNER_HANDLE_CLASS,
  MEDIA_CORNER_POSITION_CLASS,
  MEDIA_RESIZE_INFO_CLASS,
} from "../../../../utils/mediaFrameClasses";

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
  const videoProviders = useOptionalService(IVideoContentProviders) ?? [];

  const matchedProvider = useMemo(
    () => videoProviders.find(provider => provider.match(element)),
    [videoProviders, element]
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
      '[data-slate-editor="true"]'
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
    minWidth: 200,
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
    return (
      <div
        ref={containerRef}
        className={cn(
          "relative my-0 block w-fit max-w-full rounded-none",
          MEDIA_ALIGN_CLASS[align],
          isSelected &&
            "after:pointer-events-none after:absolute after:-inset-[2px] after:rounded-none after:border-[1.5px] after:border-solid after:border-[var(--ed-accent)] after:content-['']"
        )}
        style={{
          width: resize.size.width ? `${resize.size.width}px` : width ? `${width}px` : "auto",
          maxWidth: "100%",
        }}
      >
        {useLocalVideo ? (
          <Video
            ref={videoRef}
            className="block max-w-full cursor-default"
            width={"100%"}
            controls
            src={videoUrl}
            playbackRate={playbackRate}
            onClick={handleSelect}
            onLoadedMetadata={handleVideoLoad}
          />
        ) : (
          <VideoPlayer
            ref={videoRef}
            className="block max-w-full cursor-default"
            src={videoUrl}
            playbackRate={playbackRate}
            onClick={handleSelect}
            onLoadedMetadata={handleVideoLoad}
          />
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
