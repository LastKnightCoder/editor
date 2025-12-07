import { useState, useEffect } from 'react';
import { usePlatformHandlers } from '../contexts/PlatformHandlersContext';

export interface LocalAudioProps {
  src: string;
  className?: string;
}

const LocalAudio: React.FC<LocalAudioProps> = ({ src, className }) => {
  const { loadAudio } = usePlatformHandlers();
  const [processedSrc, setProcessedSrc] = useState(src);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (loadAudio) {
      setLoading(true);
      loadAudio(src)
        .then((processed) => {
          setProcessedSrc(processed);
        })
        .catch((error) => {
          console.error('Failed to load audio:', error);
          setProcessedSrc(src); // Fallback to original src
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setProcessedSrc(src);
    }
  }, [src, loadAudio]);

  if (loading) {
    return <div className={className}>Loading audio...</div>;
  }

  return (
    <audio
      src={processedSrc}
      className={className}
      controls
    />
  );
};

export default LocalAudio;
