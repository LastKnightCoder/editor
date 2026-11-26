import OnlineVideoPlaceholder from "./OnlineVideoPlaceholder";
import { type VideoContentProvider } from "@tau/editor/extensions/media/services";

/**
 * Mobile 的视频内容源：视频插件提供的视频依赖桌面端插件，降级为提示信息。
 */

export const mobileVideoContentProviders: VideoContentProvider[] = [
  {
    id: "online",
    match: element => typeof element.metaInfo?.type === "string",
    Content: OnlineVideoPlaceholder,
  },
];
