import type { MediaCapabilities } from "@tau/whiteboard/extensions";
import { uploadResource } from "@/hooks/useUploadResource";
import { downloadFile } from "@/utils/download";
import { getImageInfo, getVideoInfo } from "@/utils";
import LocalImage from "@/components/LocalImage";

/** 桌面媒体宿主能力：选择器模态直接调用，服务注册表（IResourceService 等）亦从此取 */
export const desktopMedia: MediaCapabilities = {
  upload: uploadResource,
  download: downloadFile,
  imageInfo: getImageInfo,
  videoInfo: getVideoInfo,
};

/** 内置媒体扩展的菜单动作白名单（mediaMenu 的受限项） */
export const desktopMediaActions = [
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
] as const;

/** 图片渲染组件（本地资源解析等桌面能力） */
export const desktopMediaImage = LocalImage;
