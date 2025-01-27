import { useState } from "react";
import { useAsyncEffect } from "ahooks";
import { remoteResourceToLocal } from "@/utils";
import { convertFileSrc } from "@/commands";

interface LocalAudioProps {
  src: string;
  [key: string]: any;
}

const LocalAudio = (props: LocalAudioProps) => {
  const { src, ...rest } = props;

  const [previewUrl, setPreviewUrl] = useState(src);
  const [loading, setLoading] = useState(true);

  useAsyncEffect(async () => {
    setLoading(true);
    try {
      if (src.startsWith('http')) {
        console.log('src', src);
        const localUrl = await remoteResourceToLocal(src);
        const filePath = convertFileSrc(localUrl);
        setPreviewUrl(filePath);
        console.log('filePath', filePath);
      } else {
        const filePath = convertFileSrc(src);
        setPreviewUrl(filePath);
      }
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [src]);

  if (loading) return null;

  return (
    <audio
      src={previewUrl}
      crossOrigin={"anonymous"}
      {...rest}
    />
  )
}

export default LocalAudio;
