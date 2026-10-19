import { useRef, useState } from "react";
import { useAsyncEffect } from "ahooks";
import LocalVideo from "@/components/LocalVideo";
import { getOnlineVideoCacheStatus } from "@/commands/online-video-cache";
import TranscriptPanel from "@/components/MediaTranscript/TranscriptPanel";
import { useTranscriptSync } from "@/components/MediaTranscript/useTranscriptSync";
import { isOnlineVideoSourceType, type VLResource } from "@/types/vibe-learning";
import { onlineVideoRef } from "@/types/online-video";

interface VideoPreviewProps {
  resource: VLResource;
}

const VideoPreview: React.FC<VideoPreviewProps> = ({ resource }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const segments = resource.transcriptSegments;

  useAsyncEffect(async () => {
    const { sourceType, sourceMetaInfo } = resource;
    if (sourceType && isOnlineVideoSourceType(sourceType) && sourceMetaInfo) {
      // 未缓存时由后台索引任务下载，这里只取已缓存的本地文件
      const result = await getOnlineVideoCacheStatus({
        providerId: sourceType,
        ref: onlineVideoRef(JSON.parse(sourceMetaInfo) as Record<string, unknown>),
      }).catch(() => null);
      setVideoSrc(result?.localPath ?? resource.originalPath);
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
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-[760px] shrink-0 px-6 pb-3">
        <LocalVideo ref={setMediaRef} src={videoSrc} className="w-full" />
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
