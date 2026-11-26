import { desktopI18n } from "@/app/i18n/runtime";
import { videoSelectorMessages } from "./video-selector.messages";
import { VideoSelectionFailure } from "./video-selector-error";
export const videoSelectorT = desktopI18n.get(videoSelectorMessages).t;
export function videoSelectionFailureText(error: unknown): string {
  return error instanceof VideoSelectionFailure
    ? videoSelectorT(`failure.${error.code}`, error.params)
    : error instanceof Error
      ? error.message
      : String(error);
}
