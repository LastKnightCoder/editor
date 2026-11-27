import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../services/i18n";
import { contentEditMessages } from "../services/content-edit.messages";
import type { ContentEditIssue } from "../services/content-edit-issue";
export function ContentEditIssueText({ issue }: { issue: ContentEditIssue }) {
  const { t } = useI18n(contentEditMessages, mobileI18n);
  return issue.kind === "operation-failed" ? issue.message : t(`issue.${issue.kind}`);
}
export function ContentEditText({
  message,
}: {
  message: "editor.preparing" | "content.preparing" | "editor.retrySave";
}) {
  return useI18n(contentEditMessages, mobileI18n).t(message);
}
