import { forwardRef, useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { resolveLocalMediaSource } from "./localMedia";

type LocalImageProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src"
> & {
  url: string;
};

const LocalImage = forwardRef<HTMLImageElement, LocalImageProps>(
  ({ url, onError, ...restProps }, ref) => {
    const [resolvedUrl, setResolvedUrl] = useState(url);

    useEffect(() => {
      let cancelled = false;
      setResolvedUrl(url);

      void (async () => {
        try {
          const nextUrl = await resolveLocalMediaSource(url);
          if (!cancelled) {
            setResolvedUrl(nextUrl);
          }
        } catch (error) {
          console.error("[mobile-local-image] resolve failed", error);
          if (!cancelled) {
            setResolvedUrl(url);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [url]);

    const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
      if (resolvedUrl !== url) {
        setResolvedUrl(url);
      }
      onError?.(event);
    };

    return (
      <img
        ref={ref}
        src={resolvedUrl || url}
        loading="lazy"
        onError={handleError}
        {...restProps}
      />
    );
  },
);

LocalImage.displayName = "LocalImage";

export default LocalImage;
