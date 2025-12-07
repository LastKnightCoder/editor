import VideoTimestampExtension from "./VideoTimestamp";
import VideoScreenshotExtension from "./VideoScreenshot";
import { VideoController } from "../VideoController";

export const createVideoNoteExtensions = (videoController: VideoController) => {
  const videoTimestampExtension = new VideoTimestampExtension(videoController);
  const videoScreenshotExtension = new VideoScreenshotExtension(
    videoController,
  );

  return [videoTimestampExtension, videoScreenshotExtension];
};
