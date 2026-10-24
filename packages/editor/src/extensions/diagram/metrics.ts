import type { ContentMetricRule } from "@tau/db-schema/content-metrics";

export const diagramMetricRules = [
  {
    type: "mermaid",
    textFields: ["chart"],
  },
  {
    type: "plantuml",
    textFields: ["content"],
  },
] as const satisfies readonly ContentMetricRule[];
