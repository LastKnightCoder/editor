import { forwardRef, useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { resolveLocalMediaSource } from "./localMedia";
import { useOptionalService } from "@tau/editor";
import { IResourceService } from "@tau/shared/host-services";
import { AudioPlayer, type AudioPlayerProps } from "@tau/shared";
import { TranscriptionStatus } from "../../features/cards/recording/TranscriptionStatus";

type LocalAudioProps = AudioPlayerProps & {
  src: string;
};

const LocalAudio = forwardRef<HTMLAudioElement, LocalAudioProps>(
  ({ src, onError, ...restProps }, ref) => {
    const resolveResource = useOptionalService(IResourceService)?.remoteResourceToLocal;
    const [resolvedSrc, setResolvedSrc] = useState(src);

    useEffect(() => {
      let cancelled = false;
      setResolvedSrc(src);

      void (async () => {
        try {
          const nextSrc = await resolveLocalMediaSource(src, { resolveResource });
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
    }, [src, resolveResource]);

    const handleError = (event: SyntheticEvent<HTMLAudioElement, Event>) => {
      if (resolvedSrc !== src) {
        setResolvedSrc(src);
      }
      onError?.(event);
    };

    return (
      <>
        <AudioPlayer ref={ref} src={resolvedSrc || src} onError={handleError} {...restProps} />
        <TranscriptionStatus src={src} />
      </>
    );
  }
);

LocalAudio.displayName = "LocalAudio";

export default LocalAudio;
