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

  useAsyncEffect(async () => {
    try {
      if (src.startsWith('http')) {
        const localUrl = await remoteResourceToLocal(src);
        const filePath = convertFileSrc(localUrl);
        setPreviewUrl(filePath);
      } else {
        const filePath = convertFileSrc(src);
        setPreviewUrl(filePath);
      }
    } catch(e) {
      console.error(e);
    }
  }, [src]);

  return (
    <audio
      src={previewUrl}
      {...rest}
    />
  )
}

export default LocalAudio;
