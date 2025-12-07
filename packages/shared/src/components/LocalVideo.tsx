import { forwardRef, useState, useEffect } from 'react';
import { usePlatformHandlers } from '../contexts/PlatformHandlersContext';

export interface LocalVideoProps {
  src: string;
  className?: string;
  width?: string | number;
  controls?: boolean;
  playbackRate?: number;
  onClick?: (e: React.MouseEvent) => void;
  onLoadedMetadata?: () => void;
}

const LocalVideo = forwardRef<HTMLVideoElement, LocalVideoProps>(
  ({ src, className, width, controls, playbackRate: _playbackRate, onClick, onLoadedMetadata }, ref) => {
    const { loadVideo } = usePlatformHandlers();
    const [processedSrc, setProcessedSrc] = useState(src);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      if (loadVideo) {
        setLoading(true);
        loadVideo(src)
          .then((processed) => {
            setProcessedSrc(processed);
          })
          .catch((error) => {
            console.error('Failed to load video:', error);
            setProcessedSrc(src); // Fallback to original src
          })
          .finally(() => {
            setLoading(false);
          });
      } else {
        setProcessedSrc(src);
      }
    }, [src, loadVideo]);

    if (loading) {
      return <div className={className} style={{ width }}>Loading video...</div>;
    }

    return (
      <video
        ref={ref}
        src={processedSrc}
        className={className}
        width={width}
        controls={controls}
        onClick={onClick}
        onLoadedMetadata={onLoadedMetadata}
      />
    );
  }
);

LocalVideo.displayName = 'LocalVideo';

export default LocalVideo;
