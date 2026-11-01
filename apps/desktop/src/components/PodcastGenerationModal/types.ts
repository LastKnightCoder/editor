export interface CloneVoiceItem {
  id: string;
  voiceId: string;
  voiceIdError: string;
  audioFile: AudioFileItem | null;
}

export interface AudioFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
}

export type NoticeType = "success" | "error" | "warning" | "info";

export interface VoiceOption {
  id: string;
  name: string;
  description?: string;
  type?: "system" | "cloned" | "custom";
  provider?: string;
}
