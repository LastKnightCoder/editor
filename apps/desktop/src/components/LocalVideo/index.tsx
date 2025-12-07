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
import { addRemoteVideoCacheEntry } from "@/commands/remote-video-cache";
import { isLikelyVideoSource } from "@/utils/video";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";

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
    const normalizedSrc = useGithubCdnUrl(src) ?? src;

    console.log('[LocalVideo] 接收到的 src:', src);
    console.log('[LocalVideo] normalizedSrc:', normalizedSrc);

    const [previewUrl, setPreviewUrl] = useState<string>("");
    const videoTitle =
      typeof rest?.title === "string" ? (rest.title as string) : undefined;

    const innerRef = useRef<HTMLVideoElement>(null);
    const currentTime = useRef(0);
    const playStatus = useRef(false);
    const currentMethod = useRef("default");

    const getVideoElement = useMemoizedFn(() => {
      if (typeof ref === "function") {
        return null;
      } else if (ref && ref.current) {
        return ref.current;
      } else {
        return innerRef.current;
      }
    });

    const registerRemoteVideoCache = useMemoizedFn(
      async (remoteUrl: string, localPath: string) => {
        if (!remoteUrl || !remoteUrl.startsWith("http")) {
          return;
        }
        if (!isLikelyVideoSource(remoteUrl)) {
          return;
        }
        try {
          await addRemoteVideoCacheEntry({
            url: remoteUrl,
            localPath,
            title: videoTitle,
          });
        } catch (error) {
          console.error("记录远程视频缓存失败:", error);
        }
      },
    );

    useAsyncEffect(async () => {
      let localUrl = normalizedSrc;
      try {
        console.time("localVideo");
        if (!normalizedSrc) {
          console.log('[LocalVideo] normalizedSrc 为空，返回');
          setPreviewUrl("");
          currentMethod.current = "default";
          return;
        }

        if (
          normalizedSrc.startsWith("data:") ||
          normalizedSrc.startsWith("blob:") ||
          normalizedSrc.startsWith("http://localhost")
        ) {
          console.log('[LocalVideo] 直接使用 URL (data/blob/localhost):', normalizedSrc);
          setPreviewUrl(normalizedSrc);
          currentMethod.current = "default";
          return;
        }

        if (normalizedSrc.startsWith("http")) {
          try {
            localUrl = await remoteResourceToLocal(normalizedSrc);
            await registerRemoteVideoCache(normalizedSrc, localUrl);
          } catch (error) {
            console.error("下载视频失败:", error);
            setPreviewUrl(normalizedSrc);
            currentMethod.current = "default";
            return;
          }
        }

        const homeDir = await getHomeDir();
        const absolutePath = localUrl.startsWith("~")
          ? `${homeDir}${localUrl.slice(1)}`
          : localUrl;
        const appDir = await getEditorDir();

        let videoUrl: string;
        if (absolutePath.startsWith(appDir)) {
          videoUrl = await convertFileSrc(absolutePath);
          currentMethod.current = "localhost";
        } else {
          const data = (await readBinaryFile(
            absolutePath,
          )) as Uint8Array<ArrayBuffer>;
          const ext = await getFileExtension(absolutePath);
          const blob = new Blob([data], { type: getMimeType(ext) });
          videoUrl = URL.createObjectURL(blob);
          currentMethod.current = "read-file";
        }

        const videoElement = getVideoElement();
        if (videoElement) {
          currentTime.current = videoElement.currentTime;
          playStatus.current = !videoElement.paused;
        }
        setPreviewUrl(videoUrl);
      } catch (e) {
        console.error(e);
        setPreviewUrl(normalizedSrc);
        currentMethod.current = "default";
      } finally {
        console.timeEnd("localVideo");
      }
    }, [normalizedSrc, registerRemoteVideoCache]);

    useEffect(() => {
      const videoElement = getVideoElement();
      if (videoElement && previewUrl) {
        videoElement.currentTime = currentTime.current;
        if (playStatus.current) {
          videoElement.play().then();
        }
      }
    }, [previewUrl, getVideoElement]);

    useEffect(() => {
      const videoElement = getVideoElement();
      if (!videoElement || !previewUrl) return;

      const storageKey = `${VIDEO_POSITION_PREFIX}${normalizedSrc}`;

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

      const handleTimeUpdate = () => {
        if (videoElement.currentTime >= 0) {
          localStorage.setItem(storageKey, videoElement.currentTime.toString());
        }
      };

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
    }, [normalizedSrc, previewUrl, getVideoElement]);

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
          let localUrl = normalizedSrc;

          if (normalizedSrc.startsWith("http")) {
            try {
              localUrl = await remoteResourceToLocal(normalizedSrc);
            } catch (error) {
              console.error(error);
              setPreviewUrl(normalizedSrc);
              currentMethod.current = "default";
              return;
            }
          }

          const homeDir = await getHomeDir();
          const absolutePath = localUrl.startsWith("~")
            ? `${homeDir}${localUrl.slice(1)}`
            : localUrl;
          const data = (await readBinaryFile(
            absolutePath,
          )) as Uint8Array<ArrayBuffer>;
          const ext = await getFileExtension(absolutePath);
          const blob = new Blob([data], { type: getMimeType(ext) });
          const videoUrl = URL.createObjectURL(blob);
          setPreviewUrl(videoUrl);

          currentMethod.current = "read-file";

          return;
        } else if (currentMethod.current === "read-file") {
          setPreviewUrl(normalizedSrc);
          currentMethod.current = "default";
        }
      },
    );

    const videoRef = ref || innerRef;

    if (!previewUrl) {
      console.log('[LocalVideo] previewUrl 为空，不渲染');
      return null;
    }

    console.log('[LocalVideo] 最终渲染的 previewUrl:', previewUrl);

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
