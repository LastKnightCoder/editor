export enum SpeakerRole {
  Host = "主持人",
  Guest = "嘉宾",
}

export interface PodcastGenerationProgress {
  stage: "parsing" | "script" | "tts" | "music" | "merging" | "upload" | "complete";
  stageProgress: number;
  ttsTotal?: number;
  ttsCompleted?: number;
  message: string;
}

export interface PodcastScriptLine {
  speaker: string;
  text: string;
  voiceId: string;
  startTime: number; // Start time in seconds
  duration: number; // Duration in seconds
}

export interface PodcastSpeaker {
  name: string;
  voiceId: string;
  voiceName: string;
  role: SpeakerRole;
}

export interface IPodcast {
  id: number;
  name?: string;
  audioUrl: string;
  script: string; // Keep for backward compatibility
  scriptLines: PodcastScriptLine[]; // Structured script with timestamps
  duration: number;
  speakers: PodcastSpeaker[];
}

export interface ICreatePodcast {
  name?: string;
  audioUrl: string;
  script: string; // Keep for backward compatibility
  scriptLines: PodcastScriptLine[]; // Structured script with timestamps
  duration: number;
  speakers: PodcastSpeaker[];
}
