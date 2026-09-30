import { useState, useRef, memo, forwardRef, useCallback } from "react";
import { useAsyncEffect } from "ahooks";
import { remoteResourceToLocal } from "@/utils";
import { getHomeDir, readBinaryFile } from "@/commands";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";
import useSettingStore from "@/stores/useSettingStore";
import { addRemoteAudioCacheEntry } from "@/commands/remote-audio-cache";
import {
  isDirectMediaUrl,
  resolveLocalMediaPath,
  toLocalMediaPreviewUrl,
} from "@/utils/localMediaPath";
import { AudioPlayer, type AudioPlayerProps } from "@tau/shared";

type LocalAudioProps = AudioPlayerProps & {
  src: string;
};

const LocalAudio = memo(
  forwardRef<HTMLAudioElement, LocalAudioProps>((props, ref) => {
    const { src, ...rest } = props;
    const normalizedSrc = useGithubCdnUrl(src) ?? src;

    const [previewUrl, setPreviewUrl] = useState<string>("");
    // 解析出的本地文件路径：波形直接经 IPC 读文件（ltoh:// 协议不支持 fetch）
    const [localFilePath, setLocalFilePath] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const innerRef = useRef<HTMLAudioElement>(null);
    const autoCacheRemoteAudio = useSettingStore(state => state.setting.misc.audio.autoCacheRemote);

    useAsyncEffect(async () => {
      setLoading(true);
      setLocalFilePath(null);
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
            setLocalFilePath(localUrl);
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
          setLocalFilePath(absolutePath);
          setPreviewUrl(localPreviewUrl);
        }
      } catch (e) {
        console.error(e);
        setPreviewUrl(normalizedSrc);
      } finally {
        setLoading(false);
      }
    }, [normalizedSrc, autoCacheRemoteAudio]);

    const loadWaveformData = useCallback(async () => {
      if (!localFilePath) {
        throw new Error("no local file");
      }
      const data = await readBinaryFile(localFilePath);
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    }, [localFilePath]);

    const audioRef = ref || innerRef;

    // 解析期间以空 src 渲染，播放器保留卡片占位显示加载态，避免块凭空消失再出现
    return (
      <AudioPlayer
        ref={audioRef}
        src={loading ? "" : previewUrl}
        crossOrigin={"anonymous"}
        persistKey={normalizedSrc}
        loadWaveformData={localFilePath ? loadWaveformData : undefined}
        {...rest}
      />
    );
  })
);

export default LocalAudio;
