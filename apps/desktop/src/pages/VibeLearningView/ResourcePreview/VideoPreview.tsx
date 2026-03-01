import { useRef, useState } from "react";
import { useAsyncEffect } from "ahooks";
import LocalVideo from "@/components/LocalVideo";
import { getBilibiliCacheStatus } from "@/commands/bilibili-cache";
import { getYoutubeCacheStatus } from "@/commands/youtube-cache";
import TranscriptPanel from "./TranscriptPanel";
import { useTranscriptSync } from "./useTranscriptSync";
import type {
  VLResource,
  BilibiliSourceMeta,
  YoutubeSourceMeta,
} from "@/types/vibe-learning";

interface VideoPreviewProps {
  resource: VLResource;
}

const VideoPreview: React.FC<VideoPreviewProps> = ({ resource }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const segments = resource.transcriptSegments;

  useAsyncEffect(async () => {
    if (resource.sourceType === "bilibili" && resource.sourceMetaInfo) {
      const meta = JSON.parse(resource.sourceMetaInfo) as BilibiliSourceMeta;
      const result = await getBilibiliCacheStatus(
        meta.bvid,
        meta.cid,
        meta.quality,
      );
      setVideoSrc(result?.localPath ?? resource.originalPath);
    } else if (resource.sourceType === "youtube" && resource.sourceMetaInfo) {
      const meta = JSON.parse(resource.sourceMetaInfo) as YoutubeSourceMeta;
      const sourceUrl = (meta.url || resource.originalPath || "").trim();
      if (sourceUrl) {
        const result = await getYoutubeCacheStatus(sourceUrl);
        setVideoSrc(result?.localPath ?? sourceUrl);
      } else {
        setVideoSrc(resource.originalPath);
      }
    } else {
      setVideoSrc(resource.originalPath);
    }
  }, [resource.sourceType, resource.sourceMetaInfo, resource.originalPath]);

  const {
    currentSegmentIndex,
    transcriptContainerRef,
    segmentRefsMap,
    handleSegmentClick,
    setMediaRef,
  } = useTranscriptSync({ segments, mediaRef: videoRef });

  if (!videoSrc) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 w-full">
        <LocalVideo
          ref={setMediaRef}
          src={videoSrc}
          controls
          className="w-full aspect-video bg-black"
        />
      </div>
      <TranscriptPanel
        segments={segments}
        currentSegmentIndex={currentSegmentIndex}
        containerRef={transcriptContainerRef}
        segmentRefsMap={segmentRefsMap}
        onSegmentClick={handleSegmentClick}
      />
    </div>
  );
};

export default VideoPreview;
