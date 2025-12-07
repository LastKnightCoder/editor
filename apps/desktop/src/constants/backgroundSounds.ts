import { BackgroundSoundType } from "@/stores/usePomodoroStore";

import brookAudio from "@/assets/audio/brook.mp3";
import birdsAudio from "@/assets/audio/birds.mp3";
import autumnAudio from "@/assets/audio/autumn.mp3";
import tideAudio from "@/assets/audio/tide.mp3";
import summerAudio from "@/assets/audio/summer.mp3";
import windChimeAudio from "@/assets/audio/wind-chime.mp3";
import bonfireAudio from "@/assets/audio/bonfire.mp3";
import rainAudio from "@/assets/audio/rain.mp3";

export const BACKGROUND_SOUND_NAMES: Record<
  Exclude<BackgroundSoundType, null>,
  string
> = {
  brook: "小溪",
  birds: "小鸟",
  autumn: "秋风",
  tide: "潮汐",
  summer: "夏夜",
  "wind-chime": "风铃",
  bonfire: "篝火",
  rain: "大雨",
};

export const BACKGROUND_SOUND_FILES: Record<
  Exclude<BackgroundSoundType, null>,
  string
> = {
  brook: brookAudio,
  birds: birdsAudio,
  autumn: autumnAudio,
  tide: tideAudio,
  summer: summerAudio,
  "wind-chime": windChimeAudio,
  bonfire: bonfireAudio,
  rain: rainAudio,
};

export const BACKGROUND_SOUND_OPTIONS: Array<{
  value: BackgroundSoundType;
  label: string;
}> = [
  { value: null, label: "无背景音" },
  { value: "brook", label: BACKGROUND_SOUND_NAMES.brook },
  { value: "birds", label: BACKGROUND_SOUND_NAMES.birds },
  { value: "autumn", label: BACKGROUND_SOUND_NAMES.autumn },
  { value: "tide", label: BACKGROUND_SOUND_NAMES.tide },
  { value: "summer", label: BACKGROUND_SOUND_NAMES.summer },
  { value: "wind-chime", label: BACKGROUND_SOUND_NAMES["wind-chime"] },
  { value: "bonfire", label: BACKGROUND_SOUND_NAMES.bonfire },
  { value: "rain", label: BACKGROUND_SOUND_NAMES.rain },
];
