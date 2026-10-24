import type { ContentMetricRule } from "@tau/db-schema/content-metrics";

export const mathMetricRules = [
  {
    type: "inline-math",
    textFields: ["tex"],
  },
  {
    type: "block-math",
    textFields: ["tex"],
  },
] as const satisfies readonly ContentMetricRule[];
