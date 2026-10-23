import React, { useEffect, useRef, useState, memo, forwardRef, useCallback } from "react";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils";
import { resolveLocalMediaPath, toLocalMediaPreviewUrl } from "@/utils/localMediaPath";
import { resolveMediaSource } from "@/utils/mediaSource";
import { VideoPlayer, type VideoPlayerProps } from "@tau/shared";

type LocalVideoProps = VideoPlayerProps & {
  src: string;
};

const LocalVideo = memo(
  forwardRef<HTMLVideoElement, LocalVideoProps>((props, ref) => {
    const { src, children, ...rest } = props;
    console.log("[LocalVideo] 接收到的 src:", src);

    const [previewUrl, setPreviewUrl] = useState<string>("");
    const videoTitle = typeof rest?.title === "string" ? (rest.title as string) : undefined;
    // 标题只写进缓存条目，变化时不重新解析
    const videoTitleRef = useRef(videoTitle);
    videoTitleRef.current = videoTitle;

    const innerRef = useRef<HTMLVideoElement>(null);
    const currentTime = useRef(0);
    const playStatus = useRef(false);
    const currentMethod = useRef("default");

    const setVideoRef = useCallback(
      (element: HTMLVideoElement | null) => {
        innerRef.current = element;
        if (typeof ref === "function") {
          ref(element);
        } else if (ref) {
          ref.current = element;
        }
      },
      [ref]
    );

    const getVideoElement = useMemoizedFn(() => {
      if (ref && typeof ref !== "function" && ref.current) {
        return ref.current;
      }
      return innerRef.current;
    });

    useAsyncEffect(async () => {
      console.time("localVideo");
      try {
        const resolved = await resolveMediaSource(src, {
          kind: "video",
          autoCacheRemote: true,
          title: videoTitleRef.current,
        });
        if (!resolved) {
          setPreviewUrl("");
          currentMethod.current = "default";
          return;
        }
        currentMethod.current =
          resolved.method === "app-protocol"
            ? "localhost"
            : resolved.method === "blob"
              ? "read-file"
              : "default";

        const videoElement = getVideoElement();
        if (videoElement && currentMethod.current !== "default") {
          currentTime.current = videoElement.currentTime;
          playStatus.current = !videoElement.paused;
        }
        setPreviewUrl(resolved.url);
      } finally {
        console.timeEnd("localVideo");
      }
    }, [src]);

    useEffect(() => {
      const videoElement = getVideoElement();
      if (videoElement && previewUrl) {
        videoElement.currentTime = currentTime.current;
        if (playStatus.current) {
          videoElement.play().then();
        }
      }
    }, [previewUrl, getVideoElement]);

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
          let localUrl = await resolveLocalMediaPath(src);

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
          setPreviewUrl(src);
          currentMethod.current = "default";
        }
      }
    );

    if (!previewUrl) {
      console.log("[LocalVideo] previewUrl 为空，不渲染");
      return null;
    }

    console.log("[LocalVideo] 最终渲染的 previewUrl:", previewUrl);

    return (
      <VideoPlayer
        ref={setVideoRef}
        onError={handleOnError}
        src={previewUrl}
        crossOrigin="anonymous"
        persistKey={src}
        {...rest}
      >
        {children}
      </VideoPlayer>
    );
  })
);

export default LocalVideo;
