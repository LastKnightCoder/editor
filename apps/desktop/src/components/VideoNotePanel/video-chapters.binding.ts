import { desktopI18n } from "@/app/i18n/runtime";
import { videoChaptersMessages } from "./video-chapters.messages";
import { VideoChaptersFailure } from "./video-chapters-error";
export const videoChaptersT = desktopI18n.get(videoChaptersMessages).t;
export function videoChaptersFailureText(error: unknown): string {
  return error instanceof VideoChaptersFailure
    ? videoChaptersT(`failure.${error.code}`)
    : error instanceof Error
      ? error.message
      : String(error);
}
