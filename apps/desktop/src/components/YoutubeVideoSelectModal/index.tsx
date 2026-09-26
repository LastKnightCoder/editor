import React, { useState, useCallback, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { Youtube } from "lucide-react";
import { Button, Dialog, DialogBody, Select } from "@tau/ui";
import { isYoutubeUrl } from "@/utils/youtube/parser";
import { getYoutubeVideoInfo } from "@/commands/youtube-cache";
import useSettingStore from "@/stores/useSettingStore";
import type { StreamOption, YoutubeVideoInfo } from "@/types";
import {
  ResourceSelectError,
  ResourceSelectField,
  ResourceSelectInput,
  ResourceSelectPreview,
} from "@/components/ResourceSelectDialog";

export interface YoutubeVideoSelectResult {
  url: string;
  videoStream: StreamOption;
  audioStream: StreamOption;
  title: string;
  thumbnail?: string;
}

interface YoutubeVideoSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: YoutubeVideoSelectResult) => void;
  initialUrl?: string;
}

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatStreamLabel = (stream: StreamOption, isVideo: boolean): string =>
  [
    isVideo ? stream.resolution : "",
    stream.format?.toUpperCase(),
    stream.codecs || "unknown",
    isVideo && stream.fps ? `${stream.fps}fps` : "",
    !isVideo && stream.bitrate ? `${Math.round(stream.bitrate / 1024)}kbps` : "",
    stream.size ? formatFileSize(Number(stream.size)) : "",
  ]
    .filter(Boolean)
    .join(" · ");

const YoutubeVideoSelectModal: React.FC<YoutubeVideoSelectModalProps> = ({
  open,
  onCancel,
  onConfirm,
  initialUrl = "",
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [step, setStep] = useState<"input" | "config">("input");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<YoutubeVideoInfo | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string>("");
  const [selectedAudio, setSelectedAudio] = useState<string>("");
  const { setting } = useSettingStore.getState();

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      setStep("input");
      setError(null);
      setVideoInfo(null);
      setSelectedVideo("");
      setSelectedAudio("");
    }
  }, [open, initialUrl]);

  const handleAnalyze = useMemoizedFn(async () => {
    if (!url.trim()) {
      setError("请输入 YouTube 链接");
      return;
    }

    if (!isYoutubeUrl(url)) {
      setError("请输入有效的 YouTube 链接");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const info = await getYoutubeVideoInfo(url, setting.integration.youtube.proxy);

      if (!info) {
        setError("无法获取视频信息，请检查链接是否正确");
        return;
      }

      if (info.videoStreams.length === 0) {
        setError("未找到可用的视频流");
        return;
      }

      if (info.audioStreams.length === 0) {
        setError("未找到可用的音频流");
        return;
      }

      // 按分辨率排序视频流（高分辨率在前）
      const sortedVideoStreams = [...info.videoStreams].sort((a, b) => {
        const getResolutionValue = (resolution: string): number => {
          const match = resolution.match(/(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        };
        return getResolutionValue(b.resolution) - getResolutionValue(a.resolution);
      });

      setVideoInfo({
        ...info,
        videoStreams: sortedVideoStreams,
      });
      setSelectedVideo(sortedVideoStreams[0]?.id || "");
      setSelectedAudio(info.audioStreams[0]?.id || "");
      setStep("config");
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败，请稍后重试");
    } finally {
      setIsAnalyzing(false);
    }
  });

  const handleSubmit = useMemoizedFn(() => {
    if (!videoInfo) return;

    const videoStream = videoInfo.videoStreams.find(f => f.id === selectedVideo);
    const audioStream = videoInfo.audioStreams.find(f => f.id === selectedAudio);

    if (!videoStream || !audioStream) {
      setError("请选择视频和音频流");
      return;
    }

    onConfirm({
      url: videoInfo.url,
      videoStream,
      audioStream,
      title: videoInfo.title,
      thumbnail: videoInfo.thumbnail,
    });
  });

  const handleBack = useCallback(() => {
    setStep("input");
    setVideoInfo(null);
    setSelectedVideo("");
    setSelectedAudio("");
    setError(null);
  }, []);

  const isConfig = step === "config" && !!videoInfo;

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      title="添加 YouTube 视频"
      subtitle={isConfig ? undefined : "粘贴视频链接，解析后选择音视频流"}
      icon={<Youtube className="size-4" strokeWidth={1.75} />}
      locked={isAnalyzing}
      footer={
        isConfig ? (
          <>
            <Button variant="secondary" size="sm" onClick={handleBack}>
              返回
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit}>
              确认添加
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" disabled={isAnalyzing} onClick={onCancel}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isAnalyzing}
              loadingText="正在解析…"
              disabled={!url.trim()}
              onClick={handleAnalyze}
            >
              解析视频
            </Button>
          </>
        )
      }
    >
      <DialogBody>
        {isConfig ? (
          <div className="flex flex-col gap-3.5">
            <ResourceSelectPreview
              cover={videoInfo.thumbnail}
              title={videoInfo.title}
              meta="YouTube · 已默认选最高可用的流"
            />
            <ResourceSelectField label="视频流">
              <Select
                aria-label="视频流"
                value={selectedVideo}
                onValueChange={v => setSelectedVideo(v)}
                options={videoInfo.videoStreams.map(stream => ({
                  value: stream.id,
                  label: formatStreamLabel(stream, true),
                }))}
              />
            </ResourceSelectField>
            <ResourceSelectField label="音频流">
              <Select
                aria-label="音频流"
                value={selectedAudio}
                onValueChange={v => setSelectedAudio(v)}
                options={videoInfo.audioStreams.map(stream => ({
                  value: stream.id,
                  label: formatStreamLabel(stream, false),
                }))}
              />
            </ResourceSelectField>
            {error && <ResourceSelectError text={error} />}
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <ResourceSelectField label="视频链接">
              <ResourceSelectInput
                data-autofocus
                type="url"
                value={url}
                onChange={e => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                placeholder="https://www.youtube.com/watch?v=…"
                disabled={isAnalyzing}
                onKeyDown={e => e.key === "Enter" && !isAnalyzing && handleAnalyze()}
              />
            </ResourceSelectField>
            {error && <ResourceSelectError text={error} />}
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
};

export default YoutubeVideoSelectModal;
