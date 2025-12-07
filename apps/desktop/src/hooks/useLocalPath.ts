import { useState } from "react";
import { useAsyncEffect } from "ahooks";
import { convertFileSrc, getHomeDir } from "@/commands/file";
import { remoteResourceToLocal } from "@/utils/resouce";
import useSettingStore from "@/stores/useSettingStore";
import { addRemoteAudioCacheEntry } from "@/commands/remote-audio-cache";

interface UseLocalPathOptions {
  mediaType?: "audio";
}

const useLocalPath = (src: string, options?: UseLocalPathOptions) => {
  const [localPath, setLocalPath] = useState("");
  const [loading, setLoading] = useState(true);
  const autoCacheRemoteAudio = useSettingStore(
    (state) => state.setting.misc.audio.autoCacheRemote,
  );
  const mediaType = options?.mediaType;

  useAsyncEffect(async () => {
    setLoading(true);
    try {
      if (!src) {
        setLocalPath("");
        return;
      }

      if (src.startsWith("data:") || src.startsWith("blob:")) {
        setLocalPath(src);
        return;
      }

      if (src.startsWith("http")) {
        try {
          if (mediaType === "audio" && !autoCacheRemoteAudio) {
            setLocalPath(src);
            return;
          }
          const localUrl = await remoteResourceToLocal(src);
          if (mediaType === "audio") {
            await addRemoteAudioCacheEntry({ url: src, localPath: localUrl });
          }
          const filePath = await convertFileSrc(localUrl);
          setLocalPath(filePath);
        } catch (error) {
          console.error(error);
          setLocalPath(src);
        }
      } else {
        const homeDir = await getHomeDir();
        const absolutePath = src.startsWith("~")
          ? `${homeDir}${src.slice(1)}`
          : src;
        const filePath = await convertFileSrc(absolutePath);
        setLocalPath(filePath);
      }
    } catch (error) {
      console.error(error);
      setLocalPath(src);
    } finally {
      setLoading(false);
    }
  }, [src, mediaType, autoCacheRemoteAudio]);

  return { localPath, loading };
};

export default useLocalPath;
