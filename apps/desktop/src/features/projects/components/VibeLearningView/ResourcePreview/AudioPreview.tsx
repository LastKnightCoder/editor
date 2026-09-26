import { useRef } from "react";
import LocalAudio from "@/components/LocalAudio";
import TranscriptPanel from "./TranscriptPanel";
import { useTranscriptSync } from "./useTranscriptSync";
import type { VLResource } from "@/types/vibe-learning";

interface AudioPreviewProps {
  resource: VLResource;
}

const AudioPreview: React.FC<AudioPreviewProps> = ({ resource }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const segments = resource.transcriptSegments;

  const {
    currentSegmentIndex,
    transcriptContainerRef,
    segmentRefsMap,
    handleSegmentClick,
    setMediaRef,
  } = useTranscriptSync({ segments, mediaRef: audioRef });

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-[760px] shrink-0 px-6 pb-3">
        <LocalAudio ref={setMediaRef} src={resource.originalPath} controls className="w-full" />
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

export default AudioPreview;
