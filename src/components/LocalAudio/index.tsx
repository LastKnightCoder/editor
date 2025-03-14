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
      // 如果是 base64 或 blob url，直接使用
      if (src.startsWith("data:") || src.startsWith("blob:")) {
        return;
      }

      if (src.startsWith("http")) {
        const localUrl = await remoteResourceToLocal(src);
        const filePath = convertFileSrc(localUrl);
        setPreviewUrl(filePath);
      } else {
        const filePath = convertFileSrc(src);
        setPreviewUrl(filePath);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [src]);

  if (loading) return null;

  return <audio src={previewUrl} crossOrigin={"anonymous"} {...rest} />;
};

export default LocalAudio;
