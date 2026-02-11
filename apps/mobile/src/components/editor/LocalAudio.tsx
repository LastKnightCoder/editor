import { forwardRef, useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { resolveLocalMediaSource } from "./localMedia";

type LocalAudioProps = React.AudioHTMLAttributes<HTMLAudioElement> & {
  src: string;
};

const LocalAudio = forwardRef<HTMLAudioElement, LocalAudioProps>(
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
          console.error("[mobile-local-audio] resolve failed", error);
          if (!cancelled) {
            setResolvedSrc(src);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [src]);

    const handleError = (event: SyntheticEvent<HTMLAudioElement, Event>) => {
      if (resolvedSrc !== src) {
        setResolvedSrc(src);
      }
      onError?.(event);
    };

    return (
      <audio
        ref={ref}
        src={resolvedSrc || src}
        onError={handleError}
        {...restProps}
      />
    );
  },
);

LocalAudio.displayName = "LocalAudio";

export default LocalAudio;
