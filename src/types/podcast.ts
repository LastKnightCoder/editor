import type { PodcastScriptLine } from "./minimax";

export enum SpeakerRole {
  Host = "主持人",
  Guest = "嘉宾",
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
