import type { ContentMetricRule } from "@tau/db-schema/content-metrics";

export const listMetricRules = [
  {
    type: "list-item",
    textFields: [],
    additionalChildren: [
      {
        path: "allContent",
        when: "isFold",
        skip: 1,
      },
    ],
  },
] as const satisfies readonly ContentMetricRule[];
