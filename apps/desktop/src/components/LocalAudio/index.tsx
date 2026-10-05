import { useState, useRef, memo, forwardRef, useCallback } from "react";
import { useAsyncEffect } from "ahooks";
import { remoteResourceToLocal } from "@/utils";
import { getCachedRemoteResource, isWebDavResource } from "@/utils/resouce";
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

/** 下载远程音频到本地缓存并登记，返回本地文件路径 */
const cacheRemoteAudio = async (url: string) => {
  const localPath = await remoteResourceToLocal(url);
  await addRemoteAudioCacheEntry({ url, localPath });
  return localPath;
};

const LocalAudio = memo(
  forwardRef<HTMLAudioElement, LocalAudioProps>((props, ref) => {
    const { src, onError, ...rest } = props;
    const normalizedSrc = useGithubCdnUrl(src) ?? src;

    const [previewUrl, setPreviewUrl] = useState<string>("");
    // 解析出的本地文件路径：波形直接经 IPC 读文件（ltoh:// 协议不支持 fetch）
    const [localFilePath, setLocalFilePath] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    // 远程流式播放中（未命中缓存时先播远程地址，后台缓存）
    const [streaming, setStreaming] = useState(false);
    const [streamFailed, setStreamFailed] = useState(false);
    const innerRef = useRef<HTMLAudioElement>(null);
    const resolveIdRef = useRef(0);
    const autoCacheRemoteAudio = useSettingStore(state => state.setting.misc.audio.autoCacheRemote);

    const applyLocalFile = useCallback(async (path: string) => {
      const { url } = await toLocalMediaPreviewUrl(path);
      setLocalFilePath(path);
      setPreviewUrl(url);
    }, []);

    useAsyncEffect(async () => {
      const resolveId = ++resolveIdRef.current;
      const isStale = () => resolveId !== resolveIdRef.current;
      setLoading(true);
      setLocalFilePath(null);
      setStreaming(false);
      setStreamFailed(false);
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
            const cached = await getCachedRemoteResource(resolvedSrc);
            if (cached) {
              await applyLocalFile(cached);
              return;
            }
            if (isWebDavResource(resolvedSrc)) {
              await applyLocalFile(await cacheRemoteAudio(resolvedSrc));
              return;
            }
            // 未缓存：大文件整段下载要等很久，先流式播放远程地址，缓存完成后供波形读取、下次直接走本地
            setPreviewUrl(resolvedSrc);
            setStreaming(true);
            void cacheRemoteAudio(resolvedSrc)
              .then(localPath => {
                if (!isStale()) setLocalFilePath(localPath);
              })
              .catch(error => console.error("[LocalAudio] 后台缓存失败", error));
          } catch (error) {
            console.error(error);
            setPreviewUrl(resolvedSrc);
          }
        } else {
          const homeDir = await getHomeDir();
          const absolutePath = resolvedSrc.startsWith("~")
            ? `${homeDir}${resolvedSrc.slice(1)}`
            : resolvedSrc;
          await applyLocalFile(absolutePath);
        }
      } catch (e) {
        console.error(e);
        setPreviewUrl(normalizedSrc);
      } finally {
        if (!isStale()) setLoading(false);
      }
    }, [normalizedSrc, autoCacheRemoteAudio]);

    // 远程地址播不了（跨域、鉴权等）时，等后台缓存就绪后改播本地文件
    useAsyncEffect(async () => {
      if (!streaming || !streamFailed || !localFilePath) return;
      setStreaming(false);
      await applyLocalFile(localFilePath);
    }, [streaming, streamFailed, localFilePath]);

    const handleError = useCallback<NonNullable<AudioPlayerProps["onError"]>>(
      event => {
        if (streaming) setStreamFailed(true);
        onError?.(event);
      },
      [streaming, onError]
    );

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
        onError={handleError}
        {...rest}
      />
    );
  })
);

export default LocalAudio;
