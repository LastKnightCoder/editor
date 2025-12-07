import { VideoController } from "../VideoController";

export const formatTimestamp = (time: number): string => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

export const createTimestampElement = (videoController: VideoController) => {
  const time = videoController.getCurrentTime();

  return {
    type: "video-timestamp",
    time,
    children: [{ type: "formatted", text: "" }],
  };
};

export const createScreenshotElement = async (
  videoController: VideoController,
) => {
  const imageUrl = await videoController.captureVideoFrame();
  if (!imageUrl) return null;

  const time = videoController.getCurrentTime();
  const timestamp = formatTimestamp(time);

  return {
    type: "video-screenshot",
    url: imageUrl,
    time,
    caption: `视频截图 - ${timestamp}`,
    children: [{ type: "formatted", text: "" }],
  };
};
