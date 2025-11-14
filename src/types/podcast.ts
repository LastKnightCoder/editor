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
  script: string;
  duration: number;
  speakers: PodcastSpeaker[];
}

export interface ICreatePodcast {
  name?: string;
  audioUrl: string;
  script: string;
  duration: number;
  speakers: PodcastSpeaker[];
}
