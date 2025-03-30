export interface VideoController {
  captureVideoFrame: () => Promise<string | null>;
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
  pause: () => void;
  play: () => void;
}

export class VideoControllerImpl implements VideoController {
  constructor(
    private getVideoElement: () => HTMLVideoElement | null,
    private uploadResource?: (file: File) => Promise<string | null>,
  ) {}

  getCurrentTime = () => {
    return this.getVideoElement()?.currentTime || 0;
  };

  seekTo = (time: number) => {
    const video = this.getVideoElement();
    if (video) {
      video.currentTime = time;
    }
  };

  captureVideoFrame = async () => {
    const video = this.getVideoElement();
    if (!video) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise<string | null>((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob || !this.uploadResource) {
          resolve(null);
          return;
        }

        const file = new File([blob], `screenshot-${Date.now()}.png`, {
          type: "image/png",
        });
        const url = await this.uploadResource(file);
        resolve(url);
      }, "image/png");
    });
  };

  pause = () => {
    const video = this.getVideoElement();
    if (video) {
      video.pause();
    }
  };

  play = () => {
    const video = this.getVideoElement();
    if (video) {
      video.play();
    }
  };
}
