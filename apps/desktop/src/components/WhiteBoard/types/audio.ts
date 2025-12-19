import { CommonElement } from "../plugins/CommonPlugin";

export interface AudioElement extends CommonElement {
  src: string;
  duration?: number; // Audio duration in seconds
  title?: string; // Optional display title
  isFromTTS?: boolean; // Whether generated from text-to-speech
  ttsText?: string; // Original text for TTS-generated audio
}
