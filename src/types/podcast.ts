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
  audioUrl: string;
  script: string;
  duration: number;
  speakers: PodcastSpeaker[];
}

export interface ICreatePodcast {
  audioUrl: string;
  script: string;
  duration: number;
  speakers: PodcastSpeaker[];
}
