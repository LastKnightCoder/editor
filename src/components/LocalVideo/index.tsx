import React, { useEffect, useRef, useState, memo, forwardRef } from "react";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import {
  readBinaryFile,
  getFileExtension,
  getHomeDir,
  getEditorDir,
  convertFileSrc,
} from "@/commands";
import { remoteResourceToLocal } from "@/utils";

interface LocalVideoProps {
  src: string;
  [key: string]: any;
}

const VIDEO_POSITION_PREFIX = "video_position_";

function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ogg": "video/ogg",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
  };
  return mimeTypes[ext.toLowerCase()] || "application/octet-stream";
}

const LocalVideo = memo(
  forwardRef<HTMLVideoElement, LocalVideoProps>((props, ref) => {
    const { src, ...rest } = props;

    const [previewUrl, setPreviewUrl] = useState(src);

    const innerRef = useRef<HTMLVideoElement>(null);
    const currentTime = useRef(0);
    const playStatus = useRef(false);
    const currentMethod = useRef("default");

    // Get the video element, prioritizing the forwarded ref if it exists
    const getVideoElement = useMemoizedFn(() => {
      if (typeof ref === "function") {
        return null; // Can't access the current value of a callback ref
      } else if (ref && ref.current) {
        return ref.current;
      } else {
        return innerRef.current;
      }
    });

    useAsyncEffect(async () => {
      let localUrl = src;
      try {
        console.time("localVideo");
        // 如果是 base64 或 blob url，直接使用
        if (
          src.startsWith("data:") ||
          src.startsWith("blob:") ||
          src.startsWith("http://localhost")
        ) {
          return;
        }

        if (src.startsWith("http")) {
          localUrl = await remoteResourceToLocal(src);
        }

        const homeDir = await getHomeDir();
        const absolutePath = localUrl.startsWith("~")
          ? `${homeDir}${localUrl.slice(1)}`
          : localUrl;
        console.log("absolutePath", absolutePath);
        const appDir = await getEditorDir();

        let videoUrl;
        if (absolutePath.startsWith(appDir)) {
          videoUrl = await convertFileSrc(absolutePath);
          currentMethod.current = "localhost";
        } else {
          const data = await readBinaryFile(absolutePath);
          const ext = await getFileExtension(absolutePath);
          const blob = new Blob([data], { type: getMimeType(ext) });
          videoUrl = URL.createObjectURL(blob);
          currentMethod.current = "read-file";
        }

        // 记录当前播放的时间等信息
        const videoElement = getVideoElement();
        if (videoElement) {
          currentTime.current = videoElement.currentTime;
          playStatus.current = !videoElement.paused;
        }
        setPreviewUrl(videoUrl);
      } catch {
        setPreviewUrl(src);
      } finally {
        console.timeEnd("localVideo");
      }
    }, [src]);

    useEffect(() => {
      // 读取完本地文件完成后，恢复播放
      const videoElement = getVideoElement();
      if (videoElement) {
        videoElement.currentTime = currentTime.current;
        if (playStatus.current) {
          videoElement.play().then();
        }
      }
    }, [previewUrl, getVideoElement]);

    // 保存和恢复播放位置
    useEffect(() => {
      const videoElement = getVideoElement();
      if (!videoElement) return;

      const storageKey = `${VIDEO_POSITION_PREFIX}${src}`;

      // 当视频元数据加载完成后恢复播放位置
      const handleLoadedMetadata = () => {
        const savedPosition = localStorage.getItem(storageKey);
        if (savedPosition && currentTime.current === 0) {
          const position = parseFloat(savedPosition);
          if (
            !isNaN(position) &&
            position >= 0 &&
            position < videoElement.duration
          ) {
            videoElement.currentTime = position;
            currentTime.current = position;
          }
        }
      };

      // 定期保存播放位置
      const handleTimeUpdate = () => {
        if (videoElement.currentTime >= 0) {
          localStorage.setItem(storageKey, videoElement.currentTime.toString());
        }
      };

      // 播放结束时清除保存的位置
      const handleEnded = () => {
        localStorage.removeItem(storageKey);
      };

      videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
      videoElement.addEventListener("timeupdate", handleTimeUpdate);
      videoElement.addEventListener("ended", handleEnded);

      return () => {
        videoElement.removeEventListener(
          "loadedmetadata",
          handleLoadedMetadata,
        );
        videoElement.removeEventListener("timeupdate", handleTimeUpdate);
        videoElement.removeEventListener("ended", handleEnded);
      };
    }, [src, getVideoElement]);

    const handleOnError = useMemoizedFn(
      async (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
        // @ts-ignore
        const errorCode = e.target.error?.code as string;
        const errorMessage: string =
          {
            "1": "MEDIA_ERR_ABORTED - 用户取消加载",
            "2": "MEDIA_ERR_NETWORK - 网络错误",
            "3": "MEDIA_ERR_DECODE - 解码错误",
            "4": "MEDIA_ERR_SRC_NOT_SUPPORTED - 格式不支持",
          }[errorCode] || "未知错误";

        console.error("视频错误:", errorMessage);

        if (currentMethod.current === "localhost") {
          let localUrl = src;

          if (src.startsWith("http")) {
            localUrl = await remoteResourceToLocal(src);
          }

          const homeDir = await getHomeDir();
          const absolutePath = localUrl.startsWith("~")
            ? `${homeDir}${localUrl.slice(1)}`
            : localUrl;
          const data = await readBinaryFile(absolutePath);
          const ext = await getFileExtension(absolutePath);
          const blob = new Blob([data], { type: getMimeType(ext) });
          const videoUrl = URL.createObjectURL(blob);
          setPreviewUrl(videoUrl);

          currentMethod.current = "read-file";

          return;
        } else if (currentMethod.current === "read-file") {
          setPreviewUrl(src);
          currentMethod.current = "default";
        } else {
          return;
        }
      },
    );

    // Use the provided ref if available, otherwise use innerRef
    const videoRef = ref || innerRef;

    return (
      <video
        ref={videoRef}
        onError={handleOnError}
        src={previewUrl}
        crossOrigin="anonymous"
        {...rest}
      />
    );
  }),
);

export default LocalVideo;
