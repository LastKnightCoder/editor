import React, { useEffect, useRef, useState, memo, forwardRef } from "react";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils";
import { addRemoteVideoCacheEntry } from "@/commands/remote-video-cache";
import { isLikelyVideoSource } from "@/utils/video";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";
import {
  isDirectMediaUrl,
  resolveLocalMediaPath,
  toLocalMediaPreviewUrl,
} from "@/utils/localMediaPath";

interface LocalVideoProps {
  src: string;
  [key: string]: any;
}

const VIDEO_POSITION_PREFIX = "video_position_";

const LocalVideo = memo(
  forwardRef<HTMLVideoElement, LocalVideoProps>((props, ref) => {
    const { src, ...rest } = props;
    const normalizedSrc = useGithubCdnUrl(src) ?? src;

    console.log("[LocalVideo] 接收到的 src:", src);
    console.log("[LocalVideo] normalizedSrc:", normalizedSrc);

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
          console.log("[LocalVideo] normalizedSrc 为空，返回");
          setPreviewUrl("");
          currentMethod.current = "default";
          return;
        }

        localUrl = await resolveLocalMediaPath(normalizedSrc);

        if (isDirectMediaUrl(localUrl)) {
          console.log(
            "[LocalVideo] 直接使用 URL (data/blob/localhost/ltoh):",
            localUrl,
          );
          setPreviewUrl(localUrl);
          currentMethod.current = "default";
          return;
        }

        if (localUrl.startsWith("http")) {
          try {
            localUrl = await remoteResourceToLocal(localUrl);
            await registerRemoteVideoCache(normalizedSrc, localUrl);
          } catch (error) {
            console.error("下载视频失败:", error);
            setPreviewUrl(localUrl);
            currentMethod.current = "default";
            return;
          }
        }

        const homeDir = await getHomeDir();
        const absolutePath = localUrl.startsWith("~")
          ? `${homeDir}${localUrl.slice(1)}`
          : localUrl;
        const { url: videoUrl, method } =
          await toLocalMediaPreviewUrl(absolutePath);
        currentMethod.current =
          method === "app-protocol" ? "localhost" : "read-file";

        const videoElement = getVideoElement();
        if (videoElement) {
          currentTime.current = videoElement.currentTime;
          playStatus.current = !videoElement.paused;
        }
        setPreviewUrl(videoUrl);
      } catch (e) {
        console.error(e);
        setPreviewUrl(localUrl || normalizedSrc);
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
          let localUrl = await resolveLocalMediaPath(normalizedSrc);

          if (localUrl.startsWith("http")) {
            try {
              localUrl = await remoteResourceToLocal(localUrl);
            } catch (error) {
              console.error(error);
              setPreviewUrl(localUrl);
              currentMethod.current = "default";
              return;
            }
          }

          const homeDir = await getHomeDir();
          const absolutePath = localUrl.startsWith("~")
            ? `${homeDir}${localUrl.slice(1)}`
            : localUrl;
          const { url: videoUrl } = await toLocalMediaPreviewUrl(absolutePath);
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
      console.log("[LocalVideo] previewUrl 为空，不渲染");
      return null;
    }

    console.log("[LocalVideo] 最终渲染的 previewUrl:", previewUrl);

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
