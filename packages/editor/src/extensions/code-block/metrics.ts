import type { ContentMetricRule } from "@tau/db-schema/content-metrics";

export const codeBlockMetricRules = [
  {
    type: "code-block",
    textFields: ["code"],
  },
  {
    type: "code-step",
    textFields: ["code"],
  },
] as const satisfies readonly ContentMetricRule[];
