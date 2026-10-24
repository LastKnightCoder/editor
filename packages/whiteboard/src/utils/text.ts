import { createContentMetrics } from "@tau/db-schema/content-metrics";
const metrics = createContentMetrics();
export const getContentLength = metrics.count;
export function getText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if ("text" in node && typeof node.text === "string") return node.text;
  if ("children" in node && Array.isArray(node.children))
    return node.children.map(getText).join("");
  return "";
}
