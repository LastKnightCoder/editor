export interface AudioController {
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (time: number) => void;
  pause: () => void;
  play: () => void;
}

export class AudioControllerImpl implements AudioController {
  constructor(private getAudioElement: () => HTMLAudioElement | null) {}

  getCurrentTime = () => {
    return this.getAudioElement()?.currentTime || 0;
  };

  getDuration = () => {
    return this.getAudioElement()?.duration || 0;
  };

  seekTo = (time: number) => {
    const audio = this.getAudioElement();
    if (audio) {
      audio.currentTime = time;
    }
  };

  pause = () => {
    const audio = this.getAudioElement();
    if (audio) {
      audio.pause();
    }
  };

  play = () => {
    const audio = this.getAudioElement();
    if (audio) {
      audio.play();
    }
  };
}
