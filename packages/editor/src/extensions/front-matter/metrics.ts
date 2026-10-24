import type { ContentMetricRule } from "@tau/db-schema/content-metrics";

export const frontMatterMetricRules = [
  {
    type: "front-matter",
    textFields: [],
  },
] as const satisfies readonly ContentMetricRule[];
