import { forwardRef, useState, useEffect } from 'react';
import { usePlatformHandlers } from '../contexts/PlatformHandlersContext';

export interface LocalImageProps {
  url: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  onLoad?: () => void;
}

const LocalImage = forwardRef<HTMLImageElement, LocalImageProps>(
  ({ url, alt, className, style, onLoad }, ref) => {
    const { loadImage } = usePlatformHandlers();
    const [processedUrl, setProcessedUrl] = useState(url);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      if (loadImage) {
        setLoading(true);
        loadImage(url)
          .then((processed) => {
            setProcessedUrl(processed);
          })
          .catch((error) => {
            console.error('Failed to load image:', error);
            setProcessedUrl(url); // Fallback to original URL
          })
          .finally(() => {
            setLoading(false);
          });
      } else {
        setProcessedUrl(url);
      }
    }, [url, loadImage]);

    if (loading) {
      return <div className={className} style={style}>Loading...</div>;
    }

    return (
      <img
        ref={ref}
        src={processedUrl}
        alt={alt}
        className={className}
        style={style}
        onLoad={onLoad}
      />
    );
  }
);

LocalImage.displayName = 'LocalImage';

export default LocalImage;
