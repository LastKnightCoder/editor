import { desktopI18n } from "@/app/i18n/runtime";
import type { RemoteVideoFailure } from "../../shared/remote-video-failure";
import { remoteVideoFailureMessages } from "./remote-video-failure.messages";
const translator = desktopI18n.get(remoteVideoFailureMessages);
export function remoteVideoHttpFailureText(status: number): string {
  return translator.t("failure.http", { status });
}
export function remoteVideoFailureText(error: RemoteVideoFailure): string {
  const values: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(error.params)) values[key] = value ?? "";
  return translator.t(`failure.${error.code}`, values);
}
