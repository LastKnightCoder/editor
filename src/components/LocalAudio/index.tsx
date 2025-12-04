import { useState, useRef, useEffect } from "react";
import { useAsyncEffect } from "ahooks";
import { remoteResourceToLocal } from "@/utils";
import { convertFileSrc, getHomeDir } from "@/commands";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";
import useSettingStore from "@/stores/useSettingStore";
import { addRemoteAudioCacheEntry } from "@/commands/remote-audio-cache";

interface LocalAudioProps {
  src: string;
  [key: string]: any;
}

const AUDIO_POSITION_PREFIX = "audio_position_";

const LocalAudio = (props: LocalAudioProps) => {
  const { src, ...rest } = props;
  const normalizedSrc = useGithubCdnUrl(src) ?? src;

  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoCacheRemoteAudio = useSettingStore(
    (state) => state.setting.misc.audio.autoCacheRemote,
  );

  useAsyncEffect(async () => {
    setLoading(true);
    try {
      if (!normalizedSrc) {
        setPreviewUrl("");
        return;
      }

      if (
        normalizedSrc.startsWith("data:") ||
        normalizedSrc.startsWith("blob:")
      ) {
        setPreviewUrl(normalizedSrc);
        return;
      }

      if (normalizedSrc.startsWith("http")) {
        try {
          if (!autoCacheRemoteAudio) {
            setPreviewUrl(normalizedSrc);
            return;
          }
          const localUrl = await remoteResourceToLocal(normalizedSrc);
          await addRemoteAudioCacheEntry({
            url: normalizedSrc,
            localPath: localUrl,
          });
          const filePath = await convertFileSrc(localUrl);
          setPreviewUrl(filePath);
        } catch (error) {
          console.error(error);
          setPreviewUrl(normalizedSrc);
        }
      } else {
        const homeDir = await getHomeDir();
        const absolutePath = normalizedSrc.startsWith("~")
          ? `${homeDir}${normalizedSrc.slice(1)}`
          : normalizedSrc;
        const filePath = await convertFileSrc(absolutePath);
        setPreviewUrl(filePath);
      }
    } catch (e) {
      console.error(e);
      setPreviewUrl(normalizedSrc);
    } finally {
      setLoading(false);
    }
  }, [normalizedSrc, autoCacheRemoteAudio]);

  useEffect(() => {
    if (!audioRef.current || loading) return;

    const audio = audioRef.current;
    const storageKey = `${AUDIO_POSITION_PREFIX}${normalizedSrc}`;

    const handleLoadedMetadata = () => {
      const savedPosition = localStorage.getItem(storageKey);
      if (savedPosition) {
        const position = parseFloat(savedPosition);
        if (!isNaN(position) && position >= 0 && position < audio.duration) {
          audio.currentTime = position;
        }
      }
    };

    const handleTimeUpdate = () => {
      if (audio.currentTime >= 0) {
        localStorage.setItem(storageKey, audio.currentTime.toString());
      }
    };

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
  }, [normalizedSrc, loading]);

  if (loading || !previewUrl) return null;

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
