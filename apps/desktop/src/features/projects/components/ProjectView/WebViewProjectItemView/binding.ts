import { desktopI18n } from "@/app/i18n/runtime";
import { ProjectWebFailure } from "@/services/project-web-failure";
import { projectWebMessages } from "./messages";
export const projectWebT = desktopI18n.get(projectWebMessages).t;
export function projectWebFailureText(cause: Error | string): string {
  return cause instanceof ProjectWebFailure
    ? projectWebT(`error.${cause.code}`)
    : cause instanceof Error
      ? cause.message
      : cause;
}
