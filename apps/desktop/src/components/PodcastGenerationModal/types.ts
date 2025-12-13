import type { PodcastSpeaker } from "@/types/podcast";
import type { PodcastScriptLine } from "@/types/minimax";
import type { Descendant } from "slate";
import type { IPodcast } from "@/types/podcast";

export interface PodcastGenerationModalProps {
  open: boolean;
  cardContent: Descendant[];
  onSuccess: (
    audioUrl: string,
    script: string,
    scriptLines: PodcastScriptLine[],
    duration: number,
    speakers: PodcastSpeaker[],
    name?: string,
  ) => void;
  onCancel: () => void;
  initialPodcast?: IPodcast;
  saveText?: string;
}

export interface CloneVoiceItem {
  id: string;
  voiceId: string;
  voiceIdError: string;
  audioFiles: AudioFileItem[];
}

export interface AudioFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
}

export type NoticeType = "success" | "error" | "warning" | "info";

export interface Notice {
  id: number;
  type: NoticeType;
  text: string;
}

export interface VoiceOption {
  voice_id: string;
  voice_name?: string;
  description?: string[];
}
