import React, { useState } from 'react';
import { useAsyncEffect } from "ahooks";
import { remoteResourceToLocal } from "@/utils";
import { convertFileSrc } from "@tauri-apps/api/tauri";

interface ILocalImageProps {
  url: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

const LocalImage = (props: ILocalImageProps) => {
  const { url, alt, className, style, onClick, ...restProps } = props;

  const [previewUrl, setPreviewUrl] = useState(url);

  useAsyncEffect(async () => {
    if (url.startsWith('http')) {
      try {
        const localUrl = await remoteResourceToLocal(url);
        const filePath = convertFileSrc(localUrl);
        setPreviewUrl(filePath);
      } catch(e) {
        console.error(e);
      }
    }
  }, [url]);

  return (
    <img src={previewUrl} alt={alt} className={className} style={style} onClick={onClick} {...restProps} />
  )
}

export default LocalImage;