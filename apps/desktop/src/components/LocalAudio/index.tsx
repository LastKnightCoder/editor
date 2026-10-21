import { useState, useRef, memo, forwardRef, useCallback } from "react";
import { useAsyncEffect } from "ahooks";
import { readBinaryFile } from "@/commands";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";
import useSettingStore from "@/stores/useSettingStore";
import { toLocalMediaPreviewUrl } from "@/utils/localMediaPath";
import { resolveMediaSource } from "@/utils/mediaSource";
import { AudioPlayer, type AudioPlayerProps } from "@tau/shared";

type LocalAudioProps = AudioPlayerProps & {
  src: string;
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
        const resolved = await resolveMediaSource(normalizedSrc, {
          kind: "audio",
          autoCacheRemote: autoCacheRemoteAudio,
        });
        if (isStale()) return;
        setPreviewUrl(resolved?.url ?? "");
        if (resolved?.localPath) setLocalFilePath(resolved.localPath);
        if (resolved?.pendingLocalPath) {
          setStreaming(true);
          void resolved.pendingLocalPath.then(localPath => {
            if (localPath && !isStale()) setLocalFilePath(localPath);
          });
        }
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
