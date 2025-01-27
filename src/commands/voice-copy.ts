import { invoke } from '@/electron';
import { SpeakerListResult, TrainSpeakerResult } from '@/types';

export const getAllSpeakerList = async (accessToken: string, secretKey: string, appid: string): Promise<SpeakerListResult | null> => {
  return await invoke('get-all-speaker-list',
    accessToken,
    secretKey,
    appid,
  );
}

export const trainSpeaker = async (appid: string, token: string, speakerId: string, audio: string): Promise<TrainSpeakerResult | null> => {
  return await invoke('train-speaker',
    appid,
    token,
    speakerId,
    audio
  );
}

export const textToSpeech = async (appid: string, token: string, text: string, speakerId: string): Promise<string | null> => {
  return await invoke('text-to-speech',
    appid,
    token,
    text,
    speakerId,
  );
}
