import { ServerConfigError, type ServerConfigIssue } from "./serverConfigIssues";
import type { McpFormsT } from "./forms.messages";

export function configIssueText(issue: ServerConfigIssue, t: McpFormsT): string {
  return issue.code === "unsupportedTransport"
    ? t("error.unsupportedTransport", { transport: issue.transport })
    : t(`error.${issue.code}`);
}
export function configErrorText(error: Error, t: McpFormsT): string {
  return error instanceof ServerConfigError ? configIssueText(error.issue, t) : error.message;
}
