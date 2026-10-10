import type { MediaExtensionOptions } from "@tau/whiteboard/extensions";
import { uploadResource } from "@/hooks/useUploadResource";
import { downloadFile } from "@/utils/download";
import { getImageInfo, getVideoInfo } from "@/utils";
import LocalImage from "@/components/LocalImage";

export const desktopMedia: MediaExtensionOptions = {
  actions: [
    "image-url",
    "image-local",
    "image-ai",
    "video-local",
    "video-url",
    "video-bilibili",
    "video-youtube",
    "open-video-note",
    "audio-local",
    "audio-url",
    "audio-tts",
  ],
  upload: uploadResource,
  download: downloadFile,
  imageInfo: getImageInfo,
  videoInfo: getVideoInfo,
  Image: LocalImage,
};
