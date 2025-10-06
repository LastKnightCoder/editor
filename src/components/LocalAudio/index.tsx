import { useState, useRef, useEffect } from "react";
import { useAsyncEffect } from "ahooks";
import { remoteResourceToLocal } from "@/utils";
import { convertFileSrc, getHomeDir } from "@/commands";

interface LocalAudioProps {
  src: string;
  [key: string]: any;
}

const AUDIO_POSITION_PREFIX = "audio_position_";

const LocalAudio = (props: LocalAudioProps) => {
  const { src, ...rest } = props;

  const [previewUrl, setPreviewUrl] = useState(src);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  useAsyncEffect(async () => {
    setLoading(true);
    try {
      // 如果是 base64 或 blob url，直接使用
      if (src.startsWith("data:") || src.startsWith("blob:")) {
        return;
      }

      if (src.startsWith("http")) {
        const localUrl = await remoteResourceToLocal(src);
        const filePath = await convertFileSrc(localUrl);
        setPreviewUrl(filePath);
      } else {
        const homeDir = await getHomeDir();
        const absolutePath = src.startsWith("~")
          ? `${homeDir}${src.slice(1)}`
          : src;
        const filePath = await convertFileSrc(absolutePath);
        setPreviewUrl(filePath);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [src]);

  // 恢复播放位置
  useEffect(() => {
    if (!audioRef.current || loading) return;

    const audio = audioRef.current;
    const storageKey = `${AUDIO_POSITION_PREFIX}${src}`;

    // 当音频加载完成后恢复播放位置
    const handleLoadedMetadata = () => {
      const savedPosition = localStorage.getItem(storageKey);
      if (savedPosition) {
        const position = parseFloat(savedPosition);
        if (!isNaN(position) && position >= 0 && position < audio.duration) {
          audio.currentTime = position;
        }
      }
    };

    // 定期保存播放位置
    const handleTimeUpdate = () => {
      if (audio.currentTime >= 0) {
        localStorage.setItem(storageKey, audio.currentTime.toString());
      }
    };

    // 播放结束时清除保存的位置
    const handleEnded = () => {
      localStorage.removeItem(storageKey);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [src, loading]);

  if (loading) return null;

  return (
    <audio
      ref={audioRef}
      src={previewUrl}
      crossOrigin={"anonymous"}
      {...rest}
    />
  );
};

export default LocalAudio;
