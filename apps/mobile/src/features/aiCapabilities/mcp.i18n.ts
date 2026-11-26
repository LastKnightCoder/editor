import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import type { ToolSource } from "./data";
import zhCN from "./locales/mcp.zh-CN.json";
import zhTW from "./locales/mcp.zh-TW.json";
import enUS from "./locales/mcp.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const mcpTranslator = mobileI18n.get(messages);
export function useMcpI18n() {
  return useI18n(messages, mobileI18n);
}
export type McpUiContext = Pick<ReturnType<typeof useMcpI18n>, "t">;
export type McpValidationIssue =
  | { kind: "nameLong" | "nameRequired" | "urlProtocol" | "urlCredentials" | "urlInvalid" }
  | { kind: "header"; fragment: string };
export function mcpValidationText(issue: McpValidationIssue): string {
  return issue.kind === "header"
    ? mcpTranslator.t("validation.header", { fragment: issue.fragment })
    : mcpTranslator.t(`validation.${issue.kind}`);
}
export type McpFailure = { kind: "connect" | "save"; cause: unknown };
export function mcpFailureText(issue: McpFailure): string {
  if (issue.cause instanceof Error) return issue.cause.message;
  if (issue.kind === "connect" && typeof issue.cause === "string") return issue.cause;
  return mcpTranslator.t(issue.kind === "connect" ? "connection.failed" : "error.save");
}
function hostGroup(source: ToolSource) {
  if (source.kind !== "host") return undefined;
  switch (source.id) {
    case "host:knowledge":
      return "knowledge";
    case "host:tasks":
      return "tasks";
    case "host:images":
      return "images";
    default:
      return undefined;
  }
}
export function sourceDisplayName(source: ToolSource, { t }: McpUiContext): string {
  const id = hostGroup(source);
  return id ? t(`host.${id}.name`) : source.name;
}
export function sourceDisplayDescription(source: ToolSource, { t }: McpUiContext): string {
  const id = hostGroup(source);
  return id ? t(`host.${id}.description`) : source.description;
}
