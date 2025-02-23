import React, { useEffect, useRef, useState } from "react";
import { useAsyncEffect } from "ahooks";
import { readBinaryFile, getFileExtension } from "@/commands";
import { remoteResourceToLocal } from "@/utils";

interface LocalVideoProps {
  src: string;
  [key: string]: any;
}

function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
  }
  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream'
}

const LocalVideo = (props: LocalVideoProps) => {
  const { src, ...rest } = props;

  const [previewUrl, setPreviewUrl] = useState(src);
  
  const ref = useRef<HTMLVideoElement>(null);
  const currentTime = useRef(0);
  const playStatus = useRef(false);

  useAsyncEffect(async () => {
    let localUrl = src;
    try {
      console.time('localVideo')
      // 如果是 base64 或 blob url，直接使用
      if (src.startsWith('data:') || src.startsWith('blob:')) {
        return;
      }

      if (src.startsWith('http')) {
        localUrl = await remoteResourceToLocal(src);
      }

      const data = await readBinaryFile(localUrl);
      const ext = await getFileExtension(localUrl)
      const blob = new Blob([data], { type: getMimeType(ext) });
      const blobUrl = URL.createObjectURL(blob);
      // 记录当前播放的时间等信息
      if (ref.current) {
        currentTime.current = ref.current.currentTime;
        playStatus.current = !ref.current.paused;
      }
      setPreviewUrl(blobUrl);
    } catch {
      setPreviewUrl(src);
    } finally {
      console.timeEnd('localVideo');
    }
  }, [src]);

  useEffect(() => {
    // 读取完本地文件完成后，恢复播放
    if (ref.current) {
      ref.current.currentTime = currentTime.current;
      if (playStatus.current) {
        ref.current.play().then();
      }
    }
  }, [previewUrl]);

  const handleOnError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    setPreviewUrl(src);
    // @ts-ignore
    const errorCode = e.target.error?.code as string;
    const errorMessage: string = {
      "1": 'MEDIA_ERR_ABORTED - 用户取消加载',
      "2": 'MEDIA_ERR_NETWORK - 网络错误',
      "3": 'MEDIA_ERR_DECODE - 解码错误',
      "4": 'MEDIA_ERR_SRC_NOT_SUPPORTED - 格式不支持'
    }[errorCode] || '未知错误';

    console.error('视频错误:', errorMessage);
  }

  return (
    <video
      ref={ref}
      onError={handleOnError}
      src={previewUrl}
      {...rest}
    />
  )
}

export default LocalVideo;
