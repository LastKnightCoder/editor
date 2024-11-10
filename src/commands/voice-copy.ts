import { invoke } from '@tauri-apps/api';
import { SpeakerListResult, TrainSpeakerResult } from '@/types';

export const getAllSpeakerList = async (accessToken: string, secretKey: string, appid: string): Promise<SpeakerListResult | null> => {
  const response_text: string = await invoke('plugin:voice_copy|get_all_speaker_list', {
    accessToken,
    secretKey,
    appid,
  });
  try {
    return JSON.parse(response_text);
  } catch (e) {
    return null;
  }
}

export const trainSpeaker = async (appid: string, token: string, speakerId: string, audio: string): Promise<TrainSpeakerResult | null> => {
  const response_str: string = await invoke('plugin:voice_copy|train_speaker', {
    appid,
    token,
    speakerId,
    audio
  });

  try {
    return JSON.parse(response_str);
  } catch (e) {
    return null;
  }
}

export const textToSpeech = async (appid: string, token: string, text: string, speakerId: string): Promise<string | null> => {
  return await invoke('plugin:voice_copy|text_to_speech', {
    appid,
    token,
    text,
    speakerId,
  });
}
