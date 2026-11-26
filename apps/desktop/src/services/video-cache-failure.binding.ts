import { desktopI18n } from "@/app/i18n/runtime";
import { VideoCacheFailure } from "../../shared/video-cache-failure";
import { videoCacheFailureMessages } from "./video-cache-failure.messages";
const translator = desktopI18n.get(videoCacheFailureMessages);
export function videoCacheFailureText(error: VideoCacheFailure): string {
  const values: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(error.params)) values[key] = value ?? "";
  return translator.t(`failure.${error.code}`, values);
}
