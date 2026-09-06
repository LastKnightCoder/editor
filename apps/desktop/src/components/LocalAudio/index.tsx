import { useState, useRef, useEffect, memo, forwardRef } from "react";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { remoteResourceToLocal } from "@/utils";
import { getHomeDir } from "@/commands";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";
import useSettingStore from "@/stores/useSettingStore";
import { addRemoteAudioCacheEntry } from "@/commands/remote-audio-cache";
import {
  isDirectMediaUrl,
  resolveLocalMediaPath,
  toLocalMediaPreviewUrl,
} from "@/utils/localMediaPath";
import { AudioPlayer } from "@tau/shared";

interface LocalAudioProps {
  src: string;
  [key: string]: any;
}

const AUDIO_POSITION_PREFIX = "audio_position_";

const LocalAudio = memo(
  forwardRef<HTMLAudioElement, LocalAudioProps>((props, ref) => {
    const { src, ...rest } = props;
    const normalizedSrc = useGithubCdnUrl(src) ?? src;

    const [previewUrl, setPreviewUrl] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const innerRef = useRef<HTMLAudioElement>(null);
    const autoCacheRemoteAudio = useSettingStore(state => state.setting.misc.audio.autoCacheRemote);

    const getAudioElement = useMemoizedFn(() => {
      if (typeof ref === "function") {
        return null;
      } else if (ref && ref.current) {
        return ref.current;
      } else {
        return innerRef.current;
      }
    });

    useAsyncEffect(async () => {
      setLoading(true);
      try {
        if (!normalizedSrc) {
          setPreviewUrl("");
          return;
        }

        const resolvedSrc = await resolveLocalMediaPath(normalizedSrc);

        if (isDirectMediaUrl(resolvedSrc)) {
          setPreviewUrl(resolvedSrc);
          return;
        }

        if (resolvedSrc.startsWith("http")) {
          try {
            if (!autoCacheRemoteAudio) {
              setPreviewUrl(resolvedSrc);
              return;
            }
            const localUrl = await remoteResourceToLocal(resolvedSrc);
            await addRemoteAudioCacheEntry({
              url: resolvedSrc,
              localPath: localUrl,
            });
            const { url: localPreviewUrl } = await toLocalMediaPreviewUrl(localUrl);
            setPreviewUrl(localPreviewUrl);
          } catch (error) {
            console.error(error);
            setPreviewUrl(resolvedSrc);
          }
        } else {
          const homeDir = await getHomeDir();
          const absolutePath = resolvedSrc.startsWith("~")
            ? `${homeDir}${resolvedSrc.slice(1)}`
            : resolvedSrc;
          const { url: localPreviewUrl } = await toLocalMediaPreviewUrl(absolutePath);
          setPreviewUrl(localPreviewUrl);
        }
      } catch (e) {
        console.error(e);
        setPreviewUrl(normalizedSrc);
      } finally {
        setLoading(false);
      }
    }, [normalizedSrc, autoCacheRemoteAudio]);

    useEffect(() => {
      const audio = getAudioElement();
      if (!audio || loading) return;

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
    }, [normalizedSrc, loading, getAudioElement]);

    const audioRef = ref || innerRef;

    if (loading || !previewUrl) return null;

    return <AudioPlayer ref={audioRef} src={previewUrl} crossOrigin={"anonymous"} {...rest} />;
  })
);

export default LocalAudio;
