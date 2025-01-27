import { useState } from "react";
import { useAsyncEffect } from "ahooks";
import { convertFileSrc } from "@/commands";

interface LocalVideoProps {
  src: string;
  [key: string]: any;
}

const LocalVideo = (props: LocalVideoProps) => {
  const { src, ...rest } = props;

  const [previewUrl, setPreviewUrl] = useState(src);

  useAsyncEffect(async () => {
    try {
      if (!src.startsWith('http')) {
        const filePath = convertFileSrc(src);
        setPreviewUrl(filePath);
      }
    } catch(e) {
      console.error(e);
    }
  }, [src]);

  return (
    <video
      src={previewUrl}
      {...rest}
    />
  )
}

export default LocalVideo;
