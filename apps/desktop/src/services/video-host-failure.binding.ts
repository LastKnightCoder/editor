import { desktopI18n } from "@/app/i18n/runtime";
import type { VideoHostFailure } from "../../shared/video-host-failure";
import { videoHostFailureMessages } from "./video-host-failure.messages";
const translator = desktopI18n.get(videoHostFailureMessages);
export function videoHostFailureText(error: VideoHostFailure): string {
  return error.code ? translator.t(`failure.${error.code}`, error.params) : error.message;
}
