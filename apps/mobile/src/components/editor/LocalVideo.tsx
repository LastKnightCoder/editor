import { forwardRef, useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { resolveLocalMediaSource } from "./localMedia";
import { VideoPlayer, type VideoPlayerProps } from "@tau/shared";

type LocalVideoProps = VideoPlayerProps & {
  src: string;
};

const LocalVideo = forwardRef<HTMLVideoElement, LocalVideoProps>(
  ({ src, onError, ...restProps }, ref) => {
    const [resolvedSrc, setResolvedSrc] = useState(src);

    useEffect(() => {
      let cancelled = false;
      setResolvedSrc(src);

      void (async () => {
        try {
          const nextSrc = await resolveLocalMediaSource(src);
          if (!cancelled) {
            setResolvedSrc(nextSrc);
          }
        } catch (error) {
          console.error("[mobile-local-video] resolve failed", error);
          if (!cancelled) {
            setResolvedSrc(src);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [src]);

    const handleError = (event: SyntheticEvent<HTMLVideoElement, Event>) => {
      if (resolvedSrc !== src) {
        setResolvedSrc(src);
      }
      onError?.(event);
    };

    return <VideoPlayer ref={ref} src={resolvedSrc || src} onError={handleError} {...restProps} />;
  }
);

LocalVideo.displayName = "LocalVideo";

export default LocalVideo;
